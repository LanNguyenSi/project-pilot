import { getCredential, type ServiceName } from "./credentials.js";

const SERVICE_URLS: Record<ServiceName, string> = {
  "project-forge": process.env.PROJECT_FORGE_URL || "https://project-forge.opentriologue.ai",
  "agent-tasks": process.env.AGENT_TASKS_URL || "https://agent-tasks.opentriologue.ai",
  "deploy-panel": process.env.DEPLOY_PANEL_URL || "https://deploy-panel.opentriologue.ai",
};

export interface ServiceResponse<T> {
  ok: true;
  data: T;
}

export interface ServiceError {
  ok: false;
  error: string;
}

export type ServiceResult<T> = ServiceResponse<T> | ServiceError;

async function callService<T>(
  userId: string,
  service: ServiceName,
  path: string,
): Promise<ServiceResult<T>> {
  const token = await getCredential(userId, service);
  if (!token) {
    return { ok: false, error: "not_configured" };
  }

  const baseUrl = SERVICE_URLS[service];

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

// --- Project Forge ---

export async function getForgeStats(userId: string) {
  // project-forge doesn't have a list endpoint, return status only
  return callService<{ ok: boolean }>(userId, "project-forge", "/api/v1/projects");
}

// --- Agent Tasks ---

interface AgentTasksProject {
  id: string;
  name: string;
  slug: string;
  description: string;
}

interface AgentTasksTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export async function getTasksProjects(userId: string) {
  return callService<{ projects: AgentTasksProject[] }>(userId, "agent-tasks", "/api/projects/available");
}

export async function getTasksClaimable(userId: string) {
  return callService<{ tasks: AgentTasksTask[] }>(userId, "agent-tasks", "/api/tasks/claimable");
}

// --- Deploy Panel ---

interface DeployServer {
  id: string;
  name: string;
  host: string;
  status: string;
  appCount: number;
}

interface DeployApp {
  name: string;
  status: string;
  server_id: string;
  server_name: string;
}

export async function getDeployServers(userId: string) {
  return callService<{ servers: DeployServer[] }>(userId, "deploy-panel", "/api/v1/servers");
}

export async function getDeployApps(userId: string) {
  return callService<{ apps: DeployApp[] }>(userId, "deploy-panel", "/api/v1/apps");
}
