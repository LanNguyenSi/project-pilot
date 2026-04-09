import type { Config } from "./config.js";

export class PilotClient {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  // ── Generic request helpers ────────────────────────────────────────────────

  private async forgeRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request(this.config.forgeUrl, { "X-API-Key": this.config.forgeApiKey }, method, path, body);
  }

  private async tasksRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request(this.config.tasksUrl, { Authorization: `Bearer ${this.config.tasksToken}` }, method, path, body);
  }

  private async deployRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request(this.config.deployUrl, { Authorization: `Bearer ${this.config.deployApiKey}` }, method, path, body);
  }

  private async request<T>(baseUrl: string, authHeaders: Record<string, string>, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText })) as Record<string, string>;
      throw new Error(err.error ?? err.message ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Forge ──────────────────────────────────────────────────────────────────

  async listProjects() {
    return this.forgeRequest<{ ok: boolean; projects: Array<{ id: string; repoUrl: string; projectName: string; createdAt: string }> }>("GET", "/api/v1/projects");
  }

  async generateProject(input: { projectName: string; summary: string; features?: string[]; constraints?: string[] }) {
    return this.forgeRequest<{ ok: boolean; sessionId: string; preview: unknown }>("POST", "/api/v1/generate", input);
  }

  async publishProject(sessionId: string) {
    return this.forgeRequest<{ ok: boolean; result: { repoUrl: string; projectName: string } }>("POST", "/api/v1/publish", { sessionId });
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTaskProjects() {
    return this.tasksRequest<{ projects: Array<{ id: string; name: string; description: string }> }>("GET", "/api/projects/available");
  }

  async listTasks(projectId: string) {
    return this.tasksRequest<{ tasks: Array<{ id: string; title: string; status: string; priority: string }> }>("GET", `/api/projects/${projectId}/tasks`);
  }

  async claimableTask() {
    return this.tasksRequest<{ tasks: Array<{ id: string; title: string; status: string; priority: string }> }>("GET", "/api/tasks/claimable");
  }

  async getTaskInstructions(taskId: string) {
    return this.tasksRequest<unknown>("GET", `/api/tasks/${taskId}/instructions`);
  }

  async claimTask(taskId: string) {
    return this.tasksRequest<unknown>("POST", `/api/tasks/${taskId}/claim`);
  }

  async createTask(projectId: string, input: { title: string; priority?: string; description?: string; template?: Record<string, unknown> }) {
    return this.tasksRequest<{ task: Record<string, unknown> }>("POST", `/api/projects/${projectId}/tasks`, input);
  }

  async transitionTask(taskId: string, status: string) {
    return this.tasksRequest<unknown>("POST", `/api/tasks/${taskId}/transition`, { status });
  }

  // ── Deploy ─────────────────────────────────────────────────────────────────

  async listServers() {
    return this.deployRequest<{ servers: Array<{ id: string; name: string; status: string; appCount: number }> }>("GET", "/api/v1/servers");
  }

  async listApps(serverId?: string) {
    const qs = serverId ? `?server_id=${serverId}` : "";
    return this.deployRequest<{ apps: Array<{ id: string; name: string; status: string; server: { name: string } }> }>("GET", `/api/v1/apps${qs}`);
  }

  async deployApp(server: string, app: string, opts?: { force?: boolean; ref?: string }) {
    return this.deployRequest<{ deploy: { id: string; status: string } }>("POST", "/api/v1/deploy", { server, app, ...opts });
  }

  async getDeployStatus(deployId: string) {
    return this.deployRequest<{ deploy: unknown }>("GET", `/api/v1/deploy/${deployId}`);
  }

  async preflight(server: string, app: string) {
    return this.deployRequest<unknown>("POST", "/api/v1/preflight", { server, app });
  }

  async rollback(server: string, app: string) {
    return this.deployRequest<{ deploy: { id: string; status: string } }>("POST", "/api/v1/rollback", { server, app });
  }

  async deployHistory(limit = 20) {
    return this.deployRequest<{ deploys: unknown[] }>("GET", `/api/v1/deploys?limit=${limit}`);
  }
}
