import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PilotClient } from "./client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function error(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

export function registerTools(server: McpServer, client: PilotClient) {

  // ── Forge Tools ──────────────────────────────────────────────────────────

  server.tool(
    "forge_list_projects",
    "List all projects created via Project Forge",
    {},
    async () => {
      try { return text(await client.listProjects()); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "forge_create_project",
    "Generate a new project scaffold. Returns a sessionId and preview (tasks, architecture, file tree). Call forge_publish_project to push to GitHub.",
    {
      projectName: z.string().describe("Repository name (alphanumeric, dots, hyphens, underscores)"),
      summary: z.string().describe("What the project does"),
      features: z.array(z.string()).optional().describe("List of features"),
      constraints: z.array(z.string()).optional().describe("Technical constraints"),
    },
    async ({ projectName, summary, features, constraints }) => {
      try { return text(await client.generateProject({ projectName, summary, features, constraints })); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "forge_publish_project",
    "Publish a previously generated project to GitHub. Requires sessionId from forge_create_project.",
    {
      sessionId: z.string().describe("Session ID from forge_create_project"),
    },
    async ({ sessionId }) => {
      try { return text(await client.publishProject(sessionId)); }
      catch (e) { return error(e); }
    },
  );

  // ── Tasks Tools ──────────────────────────────────────────────────────────

  server.tool(
    "tasks_list_projects",
    "List all projects in Agent Tasks",
    {},
    async () => {
      try { return text(await client.listTaskProjects()); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "tasks_list_tasks",
    "List tasks for a project",
    {
      projectId: z.string().describe("Project ID"),
    },
    async ({ projectId }) => {
      try { return text(await client.listTasks(projectId)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "tasks_claimable",
    "List open, unassigned tasks that can be claimed",
    {},
    async () => {
      try { return text(await client.claimableTask()); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "tasks_get_instructions",
    "Get task instructions including allowed transitions, confidence score, and recommended action",
    {
      taskId: z.string().describe("Task ID"),
    },
    async ({ taskId }) => {
      try { return text(await client.getTaskInstructions(taskId)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "tasks_claim",
    "Claim a task (sets status to in_progress)",
    {
      taskId: z.string().describe("Task ID"),
    },
    async ({ taskId }) => {
      try { return text(await client.claimTask(taskId)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "tasks_transition",
    "Transition a task to a new status (open, in_progress, review, done)",
    {
      taskId: z.string().describe("Task ID"),
      status: z.enum(["open", "in_progress", "review", "done"]).describe("Target status"),
    },
    async ({ taskId, status }) => {
      try { return text(await client.transitionTask(taskId, status)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "tasks_create",
    "Create a new task in a project",
    {
      projectId: z.string().describe("Project ID"),
      title: z.string().describe("Task title"),
      priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional().describe("Task priority (default MEDIUM)"),
      description: z.string().optional().describe("Task description"),
    },
    async ({ projectId, title, priority, description }) => {
      try { return text(await client.createTask(projectId, { title, priority, description })); }
      catch (e) { return error(e); }
    },
  );

  // ── Deploy Tools ─────────────────────────────────────────────────────────

  server.tool(
    "deploy_list_servers",
    "List all servers with status and app count",
    {},
    async () => {
      try { return text(await client.listServers()); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "deploy_list_apps",
    "List deployed apps, optionally filtered by server",
    {
      server_id: z.string().optional().describe("Filter by server ID"),
    },
    async ({ server_id }) => {
      try { return text(await client.listApps(server_id)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "deploy_app",
    "Deploy an app to a server. Returns deploy ID for status polling.",
    {
      server: z.string().describe("Server name or ID"),
      app: z.string().describe("App name"),
      force: z.boolean().optional().describe("Force deploy even if preflight fails"),
      ref: z.string().optional().describe("Git ref to deploy"),
    },
    async ({ server, app, force, ref }) => {
      try { return text(await client.deployApp(server, app, { force, ref })); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "deploy_status",
    "Get deploy status by ID",
    {
      deployId: z.string().describe("Deploy ID"),
    },
    async ({ deployId }) => {
      try { return text(await client.getDeployStatus(deployId)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "deploy_preflight",
    "Run preflight checks for an app without deploying",
    {
      server: z.string().describe("Server name or ID"),
      app: z.string().describe("App name"),
    },
    async ({ server, app }) => {
      try { return text(await client.preflight(server, app)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "deploy_rollback",
    "Rollback an app to previous version",
    {
      server: z.string().describe("Server name or ID"),
      app: z.string().describe("App name"),
    },
    async ({ server, app }) => {
      try { return text(await client.rollback(server, app)); }
      catch (e) { return error(e); }
    },
  );

  server.tool(
    "deploy_history",
    "Get recent deploy history",
    {
      limit: z.number().optional().describe("Number of entries (default 20)"),
    },
    async ({ limit }) => {
      try { return text(await client.deployHistory(limit)); }
      catch (e) { return error(e); }
    },
  );

  // ── Dashboard ────────────────────────────────────────────────────────────

  server.tool(
    "dashboard_summary",
    "Get an aggregated summary across all services: project count, claimable tasks, server status, recent deploys",
    {},
    async () => {
      try {
        const [projects, claimable, servers, deploys] = await Promise.allSettled([
          client.listProjects(),
          client.claimableTask(),
          client.listServers(),
          client.deployHistory(5),
        ]);

        return text({
          forge: projects.status === "fulfilled" ? { projectCount: projects.value.projects.length } : { error: (projects as PromiseRejectedResult).reason?.message },
          tasks: claimable.status === "fulfilled" ? { claimableCount: claimable.value.tasks.length } : { error: (claimable as PromiseRejectedResult).reason?.message },
          deploy: servers.status === "fulfilled" ? {
            serverCount: servers.value.servers.length,
            onlineCount: servers.value.servers.filter(s => s.status === "online").length,
          } : { error: (servers as PromiseRejectedResult).reason?.message },
          recentDeploys: deploys.status === "fulfilled" ? deploys.value.deploys.slice(0, 5) : [],
        });
      } catch (e) { return error(e); }
    },
  );
}
