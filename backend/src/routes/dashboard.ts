import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import {
  getTasksProjects,
  getTasksClaimable,
  getDeployServers,
  getDeployApps,
} from "../services/downstream.js";
import { listCredentials } from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const dashboard = new Hono<AppEnv>();

dashboard.use("*", requireAuth);

// GET /dashboard/summary — aggregated data from all services
dashboard.get("/summary", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const creds = await listCredentials(userId);
  const configured = creds.map((cr) => cr.service);

  // Fetch all in parallel, each with independent error handling
  const [tasksProjects, claimable, servers, apps] = await Promise.all([
    configured.includes("agent-tasks") ? getTasksProjects(userId) : null,
    configured.includes("agent-tasks") ? getTasksClaimable(userId) : null,
    configured.includes("deploy-panel") ? getDeployServers(userId) : null,
    configured.includes("deploy-panel") ? getDeployApps(userId) : null,
  ]);

  return c.json({
    services: {
      "project-forge": { configured: configured.includes("project-forge") },
      "agent-tasks": {
        configured: configured.includes("agent-tasks"),
        projectCount: tasksProjects?.ok ? tasksProjects.data.projects.length : null,
        claimableCount: claimable?.ok ? claimable.data.tasks.length : null,
        error: tasksProjects && !tasksProjects.ok ? tasksProjects.error : null,
      },
      "deploy-panel": {
        configured: configured.includes("deploy-panel"),
        serverCount: servers?.ok ? servers.data.servers.length : null,
        onlineCount: servers?.ok
          ? servers.data.servers.filter((s) => s.status === "online").length
          : null,
        appCount: apps?.ok ? apps.data.apps.length : null,
        error: servers && !servers.ok ? servers.error : null,
      },
    },
  });
});

export { dashboard };
