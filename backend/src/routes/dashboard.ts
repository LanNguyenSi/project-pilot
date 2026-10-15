import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import {
  getTasksProjects,
  getTasksClaimable,
  getDeployServers,
  getDeployApps,
} from "../services/downstream.js";
import {
  listCredentials,
  getCredential,
  CredentialUnreadableError,
  VALID_SERVICES,
  type ServiceName,
} from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const dashboard = new Hono<AppEnv>();

dashboard.use("*", requireAuth);

// GET /dashboard/summary — aggregated data from all services
dashboard.get("/summary", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const creds = await listCredentials(userId);
  const configured = creds.map((cr) => cr.service);

  // A stored credential that cannot be decrypted (e.g. after a
  // SESSION_SECRET rotation) must not fail the whole summary: mark that
  // service unreadable and skip its downstream calls. configured stays
  // true, a credential is stored, it just cannot be read.
  const unreadable = new Set<ServiceName>();
  for (const service of VALID_SERVICES) {
    if (!configured.includes(service)) continue;
    try {
      await getCredential(userId, service);
    } catch (err) {
      if (err instanceof CredentialUnreadableError) {
        unreadable.add(service);
      } else {
        throw err;
      }
    }
  }

  // Fetch all in parallel, each with independent error handling
  const tasksReady = configured.includes("agent-tasks") && !unreadable.has("agent-tasks");
  const deployReady = configured.includes("deploy-panel") && !unreadable.has("deploy-panel");
  const [tasksProjects, claimable, servers, apps] = await Promise.all([
    tasksReady ? getTasksProjects(userId) : null,
    tasksReady ? getTasksClaimable(userId) : null,
    deployReady ? getDeployServers(userId) : null,
    deployReady ? getDeployApps(userId) : null,
  ]);

  return c.json({
    services: {
      "project-forge": {
        configured: configured.includes("project-forge"),
        ...(unreadable.has("project-forge") && { unreadable: true }),
      },
      "agent-tasks": {
        configured: configured.includes("agent-tasks"),
        ...(unreadable.has("agent-tasks") && { unreadable: true }),
        projectCount: tasksProjects?.ok ? tasksProjects.data.projects.length : null,
        claimableCount: claimable?.ok ? claimable.data.tasks.length : null,
        error: tasksProjects && !tasksProjects.ok ? tasksProjects.error : null,
      },
      "deploy-panel": {
        configured: configured.includes("deploy-panel"),
        ...(unreadable.has("deploy-panel") && { unreadable: true }),
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
