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
}

export type MigrateOutcome =
  | { ok: true; result: MigrateResult }
  | {
      ok: false;
      status: number;
      error: string;
      code?: "no_snapshot" | "no_team" | "multiple_teams" | "invalid_repo";
      teams?: AgentTasksTeam[];
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
 * Find-or-create the agent-tasks project bound to the repo, then batch-import
 * the tasks. Idempotent: `externalRef` (the planforge task id) dedupes on the
 * agent-tasks side, so a second run imports only genuinely new tasks.
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

  // Batch-import the snapshotted tasks (agent-tasks caps a batch at 200).
  const items = snapshot.map(toImportTask);
  let created = 0;
  let skipped = 0;
  let failed = 0;

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

  // Tasks are now in agent-tasks (the source of truth); drop the pilot-local
  // snapshot. Re-migrating later relies on agent-tasks' own externalRef dedupe.
  if (failed === 0) {
    await deleteForgeSnapshotByRepo(userId, repoUrl);
  }

  return {
    ok: true,
    result: { projectId, projectCreated, taskCount: items.length, created, skipped, failed },
  };
}
