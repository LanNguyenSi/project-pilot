import { agentTasksRequest } from "./agent-tasks-client.js";
import {
  deleteForgeSnapshotByRepo,
  getForgeSnapshotByRepo,
  type ForgePreviewTask,
} from "./forge-task-snapshot.js";

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
  // dependsOn edges dropped because they pointed at a planforge id missing
  // from the snapshot. Only present (and non-empty) on the dependency-aware
  // (v2) import path.
  warnings?: string[];
}

export type MigrateOutcome =
  | { ok: true; result: MigrateResult }
  | {
      ok: false;
      status: number;
      error: string;
      code?: "no_snapshot" | "no_team" | "multiple_teams" | "invalid_repo" | "cyclic_dependencies";
      teams?: AgentTasksTeam[];
      // Present only for code: "cyclic_dependencies" — the planforge ids
      // forming the cycle, e.g. ["a", "b", "c", "a"].
      cycle?: string[];
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
 * DFS cycle finder restricted to `remainingIds` (the nodes Kahn's algorithm
 * couldn't order), following `dependsOnById` edges. Standard white/gray/black
 * coloring: a gray node revisited while still on the DFS stack closes a
 * cycle. `remainingIds` being non-empty guarantees one exists.
 */
function findCycle(remainingIds: Set<string>, dependsOnById: Map<string, string[]>): string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of remainingIds) color.set(id, WHITE);
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of dependsOnById.get(id) ?? []) {
      if (!remainingIds.has(dep)) continue;
      const depColor = color.get(dep);
      if (depColor === GRAY) {
        const idx = stack.indexOf(dep);
        return [...stack.slice(idx), dep];
      }
      if (depColor === WHITE) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const id of remainingIds) {
    if (color.get(id) === WHITE) {
      const found = visit(id);
      if (found) return found;
    }
  }
  // Unreachable: order.length !== tasks.length guarantees remainingIds is
  // non-empty and every node in it has an unresolved in-edge within the
  // subgraph, so a cycle must exist.
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
 */
export function topoSortForgeTasks(tasks: ForgePreviewTask[]): TopoSortResult {
  const ids = new Set(tasks.map((t) => t.id));
  const warnings: string[] = [];
  const dependsOnById = new Map<string, string[]>();

  for (const task of tasks) {
    const filtered: string[] = [];
    for (const dep of task.dependsOn ?? []) {
      if (ids.has(dep)) {
        filtered.push(dep);
      } else {
        warnings.push(`Task "${task.id}" depends on unknown planforge id "${dep}" (dropped)`);
      }
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

  const snapshot = await getForgeSnapshotByRepo(userId, repoUrl);
  if (!snapshot) {
    return {
      ok: false,
      status: 404,
      code: "no_snapshot",
      error:
        "No captured tasks for this repo. The project was generated before task migration shipped, or its session has expired.",
    };
  }

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
    // Verified against the live agent-tasks OpenAPI spec: POST
    // /api/projects/:projectId/tasks accepts `dependsOn: uuid[]` (max 50,
    // "Create-time only").
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
      throw err;
    }
    warnings = sort.warnings;

    const byId = new Map(snapshot.map((t) => [t.id, t] as const));
    // planforge task id -> agent-tasks task uuid, filled in as tasks are
    // created (or found to already exist — see the 409 branch below).
    const createdIds = new Map<string, string>();

    for (const externalId of sort.order) {
      const task = byId.get(externalId)!;
      const deps = sort.dependsOnById.get(externalId) ?? [];
      // Every dep precedes this task in `sort.order`, so it is already in
      // createdIds by the time we get here.
      const dependsOnUuids = deps.map((dep) => createdIds.get(dep)).filter((id): id is string => !!id);

      const payload = toImportTask(task);
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
        const lookup = await agentTasksRequest<{ tasks: { id: string }[] }>(
          userId,
          `/api/projects/${projectId}/tasks?externalRef=${encodeURIComponent(externalId)}`,
        );
        const existingId = lookup.ok ? lookup.data.tasks[0]?.id : undefined;
        if (!existingId) {
          return {
            ok: false,
            status: 409,
            error: `Task with externalRef "${externalId}" already exists but could not be looked up for its id`,
          };
        }
        skipped += 1;
        createdIds.set(externalId, existingId);
        continue;
      }

      return { ok: false, status: res.status, error: res.error };
    }
  }

  // Tasks are now in agent-tasks (the source of truth); drop the pilot-local
  // snapshot. Re-migrating later relies on agent-tasks' own externalRef dedupe
  // (v1 path) or the 409-lookup fallback above (v2 path).
  if (failed === 0) {
    await deleteForgeSnapshotByRepo(userId, repoUrl);
  }

  return {
    ok: true,
    result: {
      projectId,
      projectCreated,
      taskCount: snapshot.length,
      created,
      skipped,
      failed,
      ...(warnings.length > 0 ? { warnings } : {}),
    },
  };
}
