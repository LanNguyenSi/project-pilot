import { agentTasksRequest } from "./agent-tasks-client.js";
import {
  deleteForgeSnapshotByRepo,
  getForgeSnapshotByRepo,
  normalizeTaskDependsOn,
  type ForgePreviewTask,
} from "./forge-task-snapshot.js";

/** Create-route `dependsOn` cap (agent-tasks: `dependsOn: uuid[]`, maxItems 50). */
const MAX_DEPENDS_ON = 50;

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
type Priority = (typeof VALID_PRIORITIES)[number];

const IMPORT_BATCH_SIZE = 200;

interface AgentTasksProject {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  githubRepo: string | null;
}

interface AgentTasksTeam {
  id: string;
  name: string;
}

interface ImportTask {
  title: string;
  description?: string;
  priority: Priority;
  externalRef: string;
  labels: string[];
}

interface ImportResponse {
  created: number;
  skipped: number;
  failed: number;
}

export interface MigrateResult {
  projectId: string;
  projectCreated: boolean;
  taskCount: number;
  created: number;
  skipped: number;
  failed: number;
  // Human-readable notices from the dependency-aware (v2) import path only:
  // dependsOn edges dropped because they pointed at a planforge id missing
  // from the snapshot, and/or a note that some tasks were 409-skipped as
  // already existing (whose dependsOn edges are therefore NOT applied,
  // create-time only). Only present (and non-empty) on the v2 path.
  warnings?: string[];
}

export type MigrateOutcome =
  | { ok: true; result: MigrateResult }
  | {
      ok: false;
      status: number;
      error: string;
      code?:
        | "no_snapshot"
        | "no_team"
        | "multiple_teams"
        | "invalid_repo"
        | "cyclic_dependencies"
        | "too_many_dependencies";
      teams?: AgentTasksTeam[];
      // Present only for code: "cyclic_dependencies" — the planforge ids
      // forming the cycle, e.g. ["a", "b", "c", "a"].
      cycle?: string[];
      // Present only for code: "too_many_dependencies" — the planforge id of
      // the offending task (the one whose dependsOn exceeds MAX_DEPENDS_ON).
      taskId?: string;
    };

/** `https://github.com/owner/repo(.git)` -> `owner/repo`. */
export function parseOwnerRepo(repoUrl: string): string | null {
  const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return match ? match[1] : null;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug.length > 0 ? slug : "forge-project";
}

function normalizePriority(value: string | undefined): Priority {
  const upper = (value ?? "").trim().toUpperCase();
  return (VALID_PRIORITIES as readonly string[]).includes(upper) ? (upper as Priority) : "MEDIUM";
}

function toImportTask(task: ForgePreviewTask): ImportTask {
  const labels = ["source:forge"];
  const wave = task.wave?.trim();
  if (wave) labels.push(`wave:${wave}`.slice(0, 100));

  return {
    title: task.title.slice(0, 255),
    ...(task.summary?.trim() ? { description: task.summary.slice(0, 50_000) } : {}),
    priority: normalizePriority(task.priority),
    externalRef: task.id.slice(0, 255),
    labels,
  };
}

export interface TopoSortResult {
  /** Planforge task ids (`ForgePreviewTask.id`) in an order where every
   *  task's dependencies precede it. */
  order: string[];
  /** One entry per dangling `dependsOn` edge dropped (points at a planforge
   *  id not present in this snapshot). */
  warnings: string[];
  /** Each task's `dependsOn`, filtered to ids that exist in the snapshot
   *  (dangling ids dropped — see `warnings`). Keyed by planforge task id. */
  dependsOnById: Map<string, string[]>;
}

/** Thrown by topoSortForgeTasks when the dependsOn graph has a cycle. */
export class CycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Cyclic dependency: ${cycle.join(" -> ")}`);
    this.name = "CycleError";
  }
}

/**
 * Thrown by topoSortForgeTasks when a task's (dangling-filtered) dependsOn
 * exceeds the agent-tasks create-route cap (MAX_DEPENDS_ON).
 */
export class TooManyDependenciesError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly count: number,
  ) {
    super(`Task "${taskId}" has ${count} dependsOn entries (max ${MAX_DEPENDS_ON})`);
    this.name = "TooManyDependenciesError";
  }
}

/**
 * Cycle finder restricted to `remainingIds` (the nodes Kahn's algorithm
 * couldn't order), following `dependsOnById` edges. Standard white/gray/black
 * coloring: a gray node revisited while still on the current path closes a
 * cycle. `remainingIds` being non-empty guarantees one exists.
 *
 * Iterative (explicit stack), not recursive: a genuinely cyclic chain can be
 * thousands of tasks long (a real forge plan, or an adversarial snapshot),
 * and a recursive DFS one call-frame per node blows the JS call stack well
 * before that — turning a 400-worthy "your plan has a cycle" into an
 * unhandled 500. The explicit `frames` stack has no such limit.
 */
function findCycle(remainingIds: Set<string>, dependsOnById: Map<string, string[]>): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of remainingIds) color.set(id, WHITE);

  for (const start of remainingIds) {
    // Unreachable given the Kahn invariant; kept as defensive DFS bookkeeping.
    if (color.get(start) !== WHITE) continue;

    // `path` is the current DFS path (root..top), used to slice out the
    // cycle once a GRAY revisit is found. `frames` mirrors it 1:1, each
    // entry tracking how far that node's dependsOn list has been walked so
    // the loop can resume a parent instead of recursing into a child.
    const path: string[] = [start];
    const frames: { id: string; deps: string[]; i: number }[] = [
      { id: start, deps: dependsOnById.get(start) ?? [], i: 0 },
    ];
    color.set(start, GRAY);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      if (frame.i >= frame.deps.length) {
        // Unreachable given the Kahn invariant; kept as defensive DFS bookkeeping.
        color.set(frame.id, BLACK);
        path.pop();
        frames.pop();
        continue;
      }
      const dep = frame.deps[frame.i]!;
      frame.i += 1;
      if (!remainingIds.has(dep)) continue;
      const depColor = color.get(dep);
      if (depColor === GRAY) {
        const idx = path.indexOf(dep);
        return [...path.slice(idx), dep];
      }
      if (depColor === WHITE) {
        color.set(dep, GRAY);
        path.push(dep);
        frames.push({ id: dep, deps: dependsOnById.get(dep) ?? [], i: 0 });
      }
      // BLACK: already fully explored via an earlier branch — no cycle
      // through this edge, move on to the next one.
    }
  }
  // Unreachable given the Kahn invariant; kept as defensive DFS bookkeeping.
  return [...remainingIds];
}

/**
 * Topologically sort forge preview tasks by their `dependsOn` edges (Kahn's
 * algorithm) so every task's dependencies are created before it.
 * ORCHESTRATOR DESIGN DECISION D-003: `dependsOn` (not wave membership) is
 * the authoritative ordering signal; waves give a natural partial order but
 * are not re-derived here. The result is verified acyclic — a genuine cycle
 * throws `CycleError` rather than silently importing a partial order.
 *
 * A `dependsOn` id absent from this snapshot (e.g. it referenced a task
 * outside the current plan) is dropped and reported via `warnings` instead
 * of failing the sort.
 *
 * A duplicate task id in the snapshot is deduped, keeping the first
 * occurrence — a malformed/regenerated snapshot shouldn't double-count a
 * task's in-degree or double-create it.
 */
export function topoSortForgeTasks(tasks: ForgePreviewTask[]): TopoSortResult {
  const seenIds = new Set<string>();
  const deduped: ForgePreviewTask[] = [];
  for (const task of tasks) {
    if (seenIds.has(task.id)) continue;
    seenIds.add(task.id);
    deduped.push(task);
  }
  tasks = deduped;

  const ids = seenIds;
  const warnings: string[] = [];
  const dependsOnById = new Map<string, string[]>();

  for (const task of tasks) {
    const rawFiltered: string[] = [];
    for (const dep of task.dependsOn ?? []) {
      if (ids.has(dep)) {
        rawFiltered.push(dep);
      } else {
        warnings.push(`Task "${task.id}" depends on unknown planforge id "${dep}" (dropped)`);
      }
    }
    // A duplicate id within one task's own dependsOn (e.g. a regenerated
    // plan listing the same dependency twice) must not double-count against
    // MAX_DEPENDS_ON, nor reach the create payload as a repeated uuid.
    const filtered = [...new Set(rawFiltered)];
    if (filtered.length > MAX_DEPENDS_ON) {
      throw new TooManyDependenciesError(task.id, filtered.length);
    }
    dependsOnById.set(task.id, filtered);
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    inDegree.set(task.id, 0);
    dependents.set(task.id, []);
  }
  for (const task of tasks) {
    for (const dep of dependsOnById.get(task.id)!) {
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      dependents.get(dep)!.push(task.id);
    }
  }

  // Stable: tasks starts with in-degree 0 are queued in their original
  // (wave-ordered) array order, and each dependent is enqueued in the order
  // its blockers were processed — so the result is deterministic.
  const queue: string[] = tasks.filter((t) => inDegree.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  if (order.length !== tasks.length) {
    const orderedIds = new Set(order);
    const remaining = new Set(tasks.map((t) => t.id).filter((id) => !orderedIds.has(id)));
    throw new CycleError(findCycle(remaining, dependsOnById));
  }

  return { order, warnings, dependsOnById };
}

/**
 * Resolve which agent-tasks team a freshly-created project should live in.
 * Mirrors the agent-tasks `resolveTeamId` contract: exactly one team -> use it
 * silently; multiple -> caller must pick; none -> error. Only needed when no
 * project is bound to the repo yet.
 */
async function resolveTeam(
  userId: string,
  explicitTeamId: string | undefined,
): Promise<{ ok: true; teamId: string } | { ok: false; outcome: MigrateOutcome }> {
  const teamsRes = await agentTasksRequest<{ teams: AgentTasksTeam[] }>(userId, "/api/teams");
  if (!teamsRes.ok) {
    return { ok: false, outcome: { ok: false, status: teamsRes.status, error: teamsRes.error } };
  }
  const teams = teamsRes.data.teams ?? [];

  if (explicitTeamId) {
    if (teams.some((t) => t.id === explicitTeamId)) return { ok: true, teamId: explicitTeamId };
    return {
      ok: false,
      outcome: { ok: false, status: 400, error: "Selected team not found", code: "multiple_teams", teams },
    };
  }

  if (teams.length === 1) return { ok: true, teamId: teams[0]!.id };
  if (teams.length === 0) {
    return {
      ok: false,
      outcome: {
        ok: false,
        status: 400,
        code: "no_team",
        error: "No agent-tasks team found. Create a team in agent-tasks first.",
      },
    };
  }
  return {
    ok: false,
    outcome: {
      ok: false,
      status: 409,
      code: "multiple_teams",
      error: "You belong to multiple teams. Pick which one to create the project in.",
      teams,
    },
  };
}

/**
 * Migrate the snapshotted planforge tasks for a forged repo into agent-tasks.
 *
 * Find-or-create the agent-tasks project bound to the repo, then import the
 * tasks. Idempotent either way: `externalRef` (the planforge task id) dedupes
 * on the agent-tasks side, so a second run imports only genuinely new tasks.
 *
 * Two import paths, chosen by whether any task carries `dependsOn`:
 *  - No dependencies (today's only live case — see the ForgePreviewTask doc
 *    comment): flat batch import via `/tasks/import`, unchanged from v1.
 *  - At least one dependency: dependency-aware import (D-003) — topological
 *    sort, then sequential single-task creates with `dependsOn` wired to the
 *    already-created agent-tasks uuids.
 */
export async function migrateForgeTasks(
  userId: string,
  repoUrl: string,
  explicitTeamId?: string,
): Promise<MigrateOutcome> {
  const ownerRepo = parseOwnerRepo(repoUrl);
  if (!ownerRepo) {
    return { ok: false, status: 400, code: "invalid_repo", error: "Could not parse owner/repo from the repo URL." };
  }

  const rawSnapshot = await getForgeSnapshotByRepo(userId, repoUrl);
  if (!rawSnapshot) {
    return {
      ok: false,
      status: 404,
      code: "no_snapshot",
      error:
        "No captured tasks for this repo. The project was generated before task migration shipped, or its session has expired.",
    };
  }
  // Re-normalize dependsOn on the way out of storage, not just on the way
  // in: a snapshot may have been captured by an older/looser code path (or
  // the stored JSON hand-edited), so a malformed row here — e.g.
  // `dependsOn: "t0"` instead of `["t0"]` — must not reach the topo-sort's
  // graph traversal. Same normalization extractPreviewTasks applies on write.
  const snapshot = rawSnapshot.map(normalizeTaskDependsOn);

  // Find an agent-tasks project already bound to this repo. The
  // `/projects/available` endpoint resolves the actor's team; for a human in
  // multiple teams it 400s without an explicit teamId, so on that path we
  // resolve the team first and re-query scoped to it.
  let resolvedTeamId: string | undefined;
  let available = await agentTasksRequest<{ projects: AgentTasksProject[] }>(userId, "/api/projects/available");
  if (!available.ok && available.status === 400) {
    const team = await resolveTeam(userId, explicitTeamId);
    if (!team.ok) return team.outcome;
    resolvedTeamId = team.teamId;
    available = await agentTasksRequest<{ projects: AgentTasksProject[] }>(
      userId,
      `/api/projects/available?teamId=${encodeURIComponent(resolvedTeamId)}`,
    );
  }
  if (!available.ok) {
    return { ok: false, status: available.status, error: available.error };
  }
  // GitHub owner/repo is case-insensitive; agent-tasks stores it with the
  // original casing, so compare case-insensitively.
  const ownerRepoLower = ownerRepo.toLowerCase();
  const existing = available.data.projects.find((p) => p.githubRepo?.toLowerCase() === ownerRepoLower);

  let projectId: string;
  let projectCreated = false;

  if (existing) {
    projectId = existing.id;
  } else {
    if (!resolvedTeamId) {
      const team = await resolveTeam(userId, explicitTeamId);
      if (!team.ok) return team.outcome;
      resolvedTeamId = team.teamId;
    }

    const repoName = ownerRepo.split("/")[1] ?? ownerRepo;
    const created = await agentTasksRequest<{ project: AgentTasksProject }>(userId, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: repoName,
        slug: slugify(repoName),
        teamId: resolvedTeamId,
        githubRepo: ownerRepo,
      }),
    });
    if (!created.ok) {
      return { ok: false, status: created.status, error: created.error };
    }
    projectId = created.data.project.id;
    projectCreated = true;
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let warnings: string[] = [];
  // Set only on the v2 (dependency-aware) path, to `sort.order.length` — the
  // deduped total number of tasks that path ordered (and needed to end up
  // created). Reported as `taskCount` on the v2 path (v1 keeps
  // `snapshot.length`) and used, together with `v2SkippedOwnDependsOn`
  // below, to gate the snapshot delete.
  let v2TotalOrdered: number | undefined;
  // Set only on the v2 path: true when at least one 409-skipped (already
  // existed) task itself carried its own dependsOn edges that therefore
  // were never applied. A skip whose task had NO dependsOn of its own loses
  // no dependency data — such a skip alone must not block the snapshot
  // delete or trigger the "dependsOn edges were NOT applied" warning.
  let v2SkippedOwnDependsOn = false;

  const hasDependencies = snapshot.some((t) => (t.dependsOn?.length ?? 0) > 0);

  if (!hasDependencies) {
    // v1 path (unchanged): flat batch import, no dependsOn wiring. This is
    // the only path exercised while no forge source populates `dependsOn`
    // (see the ForgePreviewTask doc comment) — agent-tasks caps a batch at
    // 200 tasks.
    const items = snapshot.map(toImportTask);
    for (let i = 0; i < items.length; i += IMPORT_BATCH_SIZE) {
      const batch = items.slice(i, i + IMPORT_BATCH_SIZE);
      const res = await agentTasksRequest<ImportResponse>(
        userId,
        `/api/projects/${projectId}/tasks/import`,
        { method: "POST", body: JSON.stringify({ tasks: batch }) },
      );
      if (!res.ok) {
        return { ok: false, status: res.status, error: res.error };
      }
      created += res.data.created ?? 0;
      skipped += res.data.skipped ?? 0;
      failed += res.data.failed ?? 0;
    }
  } else {
    // v2 path (D-003): the batch import route deliberately drops `dependsOn`
    // (agent-tasks' own comment on importTaskSchema), so dependency-aware
    // import creates tasks one at a time via the single-task create route
    // instead, in topological order, wiring `dependsOn` at create time.
    //
    // Only the create-time half of this is contract-backed: POST
    // /api/projects/:projectId/tasks accepting `dependsOn: uuid[]` (max 50,
    // "Create-time only") is verified against the live agent-tasks OpenAPI
    // spec. The 409-resolution lookup below (`GET .../tasks?externalRef=`)
    // is verified against agent-tasks SOURCE only — the externalRef query
    // filter exists in the route handler but is not documented in the
    // published OpenAPI spec. An upstream OpenAPI-documentation follow-up
    // for that gap is being filed separately.
    let sort: TopoSortResult;
    try {
      sort = topoSortForgeTasks(snapshot);
    } catch (err) {
      if (err instanceof CycleError) {
        return {
          ok: false,
          status: 409,
          code: "cyclic_dependencies",
          error: `Dependency cycle detected among planforge tasks: ${err.cycle.join(" -> ")}`,
          cycle: err.cycle,
        };
      }
      if (err instanceof TooManyDependenciesError) {
        return {
          ok: false,
          status: 400,
          code: "too_many_dependencies",
          error: err.message,
          taskId: err.taskId,
        };
      }
      // Defensive: topoSortForgeTasks only ever throws CycleError or
      // TooManyDependenciesError (see its doc comment) — this rethrow is a
      // safety net against a future third error type reaching here silently
      // as an unhandled rejection rather than surfacing as a 500. Not
      // expected to trigger today.
      throw err;
    }
    warnings = sort.warnings;
    v2TotalOrdered = sort.order.length;

    const byId = new Map(snapshot.map((t) => [t.id, t] as const));
    // planforge task id -> agent-tasks task uuid, filled in as tasks are
    // created (or found to already exist — see the 409 branch below).
    const createdIds = new Map<string, string>();
    // planforge ids resolved via the 409 lookup (already existed) rather
    // than freshly created here — see the skipped-tasks gate below.
    const skippedIds: string[] = [];

    for (const externalId of sort.order) {
      const task = byId.get(externalId)!;
      const deps = sort.dependsOnById.get(externalId) ?? [];
      // Every dep precedes this task in `sort.order`, so it is already in
      // createdIds by the time we get here.
      const dependsOnUuids = deps.map((dep) => createdIds.get(dep)).filter((id): id is string => !!id);

      const payload = toImportTask(task);
      // Same truncated key drives both the create call and, on a 409, the
      // lookup below — the create route silently truncates externalRef to
      // 255 chars, so looking up with the untruncated planforge id would
      // (for ids >255 chars) query a value that was never actually stored.
      const externalRefKey = payload.externalRef;
      const res = await agentTasksRequest<{ task: { id: string } }>(
        userId,
        `/api/projects/${projectId}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            ...(dependsOnUuids.length > 0 ? { dependsOn: dependsOnUuids } : {}),
          }),
        },
      );

      if (res.ok) {
        created += 1;
        createdIds.set(externalId, res.data.task.id);
        continue;
      }

      if (res.status === 409) {
        // Idempotent re-run: this externalRef was already imported by an
        // earlier run. Look up its agent-tasks id so any later task in this
        // run that depends on it still gets a correct dependsOn edge.
        const lookup = await agentTasksRequest<{ tasks: { id: string; externalRef?: string }[] }>(
          userId,
          `/api/projects/${projectId}/tasks?externalRef=${encodeURIComponent(externalRefKey)}`,
        );
        if (!lookup.ok) {
          // Transport-level failure (timeout, upstream unreachable, 5xx) —
          // propagate the real status/error instead of misreporting it as a
          // 409 "already exists but could not be looked up".
          return { ok: false, status: lookup.status, error: lookup.error };
        }
        // Trust the lookup only when it unambiguously identifies the one
        // task the 409 was about: agent-tasks silently drops the
        // externalRef filter for values >255 chars (while this code
        // truncates only the create-side key), so an unfiltered response
        // can come back with zero, one non-matching, or many rows. Any of
        // those must fail loudly rather than wire an unrelated uuid in as a
        // dependency.
        const rows = lookup.data.tasks ?? [];
        const match = rows.length === 1 && rows[0]!.externalRef === externalRefKey ? rows[0] : undefined;
        if (!match) {
          return {
            ok: false,
            status: 409,
            error: `Task with externalRef "${externalRefKey}" already exists but its id could not be verified (lookup returned ${rows.length} matching row(s))`,
          };
        }
        skipped += 1;
        skippedIds.push(externalId);
        createdIds.set(externalId, match.id);
        continue;
      }

      return { ok: false, status: res.status, error: res.error };
    }

    // Only a skip whose own dependsOn was non-empty actually lost dependency
    // data (that edge set was never applied — see the create-time-only note
    // above); a skip on a task with no dependsOn of its own has nothing to
    // lose, so it must not trigger a false warning or block the delete below.
    v2SkippedOwnDependsOn = skippedIds.some((id) => (sort.dependsOnById.get(id)?.length ?? 0) > 0);
    if (v2SkippedOwnDependsOn) {
      warnings = [
        ...warnings,
        `${skipped} task${skipped === 1 ? "" : "s"} already existed; their dependsOn edges were NOT applied - dependsOn is create-time only`,
      ];
    }
  }

  // Tasks are now in agent-tasks (the source of truth); drop the pilot-local
  // snapshot. Re-migrating later relies on agent-tasks' own externalRef dedupe
  // (v1 path) or the 409-lookup fallback above (v2 path). On the v2 path,
  // deleting is only safe when no 409-skipped task actually lost dependency
  // data (`v2SkippedOwnDependsOn` — see above): a skip on a task with its
  // own dependsOn means those edges were never applied (create-time only),
  // so the snapshot is the only remaining copy of that data and must survive
  // for operator action. A skip on a task with no dependsOn of its own loses
  // nothing, so it does not block the delete.
  const migrationComplete = failed === 0 && !v2SkippedOwnDependsOn;
  if (migrationComplete) {
    await deleteForgeSnapshotByRepo(userId, repoUrl);
  }

  return {
    ok: true,
    result: {
      projectId,
      projectCreated,
      // v2 path: the deduped task count the topo-sort actually ordered
      // (duplicate planforge ids collapse to one). v1 keeps the raw
      // snapshot length since it doesn't dedupe.
      taskCount: v2TotalOrdered ?? snapshot.length,
      created,
      skipped,
      failed,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}
