import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getCredential } from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  labels: z.array(z.string()).optional(),
});

const transitionSchema = z.object({
  status: z.enum(["open", "in_progress", "review", "done"]),
});

const commentSchema = z.object({
  content: z.string().min(1).max(5000),
});

// Mirrors agent-tasks createProjectSchema in
// backend/src/routes/projects.ts:21-34. Keep in sync if upstream changes.
const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  description: z.string().optional(),
  teamId: z.string().uuid(),
  githubRepo: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, "GitHub repo format: owner/repo")
    .optional(),
});

const tasks = new Hono<AppEnv>();

tasks.use("*", requireAuth);

const TASKS_URL = config.AGENT_TASKS_URL;

async function tasksRequest<T>(userId: string, path: string, options?: RequestInit & { timeoutMs?: number }): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const token = await getCredential(userId, "agent-tasks");
  if (!token) {
    return { ok: false, error: "Agent Tasks not configured. Add your token in Settings.", status: 400 };
  }

  const { timeoutMs = 10_000, ...fetchOptions } = options ?? {};

  try {
    const res = await fetch(`${TASKS_URL}${path}`, {
      ...fetchOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body = await res.json() as T;
    if (!res.ok) {
      return { ok: false, error: (body as any).error || (body as any).message || `API error: ${res.status}`, status: res.status };
    }
    return { ok: true, data: body };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Agent Tasks timed out", status: 504 };
    }
    return { ok: false, error: "Agent Tasks unreachable", status: 502 };
  }
}

// GET /tasks/projects — list projects
tasks.get("/projects", async (c) => {
  const userId = c.get("userId")!;
  const result = await tasksRequest<unknown>(userId, "/api/projects/available");
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /tasks/projects/:projectId/tasks — list tasks for project
tasks.get("/projects/:projectId/tasks", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const result = await tasksRequest<unknown>(userId, `/api/projects/${encodeURIComponent(projectId)}/tasks`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /tasks/claimable — open tasks
tasks.get("/claimable", async (c) => {
  const userId = c.get("userId")!;
  const result = await tasksRequest<unknown>(userId, "/api/tasks/claimable");
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /tasks/signals — agent signals (must be before /:taskId to avoid shadowing)
tasks.get("/signals/inbox", async (c) => {
  const userId = c.get("userId")!;
  const result = await tasksRequest<unknown>(userId, "/api/agent/signals");
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /tasks/teams — teams the user is a member of. Needed to let the
// UI pick a team when creating a project or triggering a GitHub sync.
// Must stay above /:taskId to avoid route shadowing.
tasks.get("/teams", async (c) => {
  const userId = c.get("userId")!;
  const result = await tasksRequest<unknown>(userId, "/api/teams");
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /tasks/teams/:teamId/sync — sync projects from user's GitHub account
// into the given team. agent-tasks returns counts the UI surfaces as a toast.
// Longer timeout than the default — this iterates over every repo the user
// has on GitHub plus a create/update round per repo.
tasks.post("/teams/:teamId/sync", async (c) => {
  const userId = c.get("userId")!;
  const teamId = c.req.param("teamId");
  const result = await tasksRequest<unknown>(userId, `/api/teams/${encodeURIComponent(teamId)}/sync`, {
    method: "POST",
    timeoutMs: 120_000,
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /tasks/projects — create a project inside a team.
tasks.post("/projects", zValidator("json", createProjectSchema), async (c) => {
  const userId = c.get("userId")!;
  const body = c.req.valid("json");
  const result = await tasksRequest<unknown>(userId, "/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data, 201);
});

// GET /tasks/:taskId — task details
tasks.get("/:taskId", async (c) => {
  const userId = c.get("userId")!;
  const taskId = c.req.param("taskId");
  const result = await tasksRequest<unknown>(userId, `/api/tasks/${encodeURIComponent(taskId)}`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /tasks/:taskId/instructions — task instructions
tasks.get("/:taskId/instructions", async (c) => {
  const userId = c.get("userId")!;
  const taskId = c.req.param("taskId");
  const result = await tasksRequest<unknown>(userId, `/api/tasks/${encodeURIComponent(taskId)}/instructions`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /tasks/projects/:projectId/tasks — create task
tasks.post("/projects/:projectId/tasks", zValidator("json", createTaskSchema), async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const body = c.req.valid("json");
  const result = await tasksRequest<unknown>(userId, `/api/projects/${encodeURIComponent(projectId)}/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /tasks/:taskId/transition — change task status
tasks.post("/:taskId/transition", zValidator("json", transitionSchema), async (c) => {
  const userId = c.get("userId")!;
  const taskId = c.req.param("taskId");
  const body = c.req.valid("json");
  const result = await tasksRequest<unknown>(userId, `/api/tasks/${encodeURIComponent(taskId)}/transition`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /tasks/:taskId/comments — add comment
tasks.post("/:taskId/comments", zValidator("json", commentSchema), async (c) => {
  const userId = c.get("userId")!;
  const taskId = c.req.param("taskId");
  const body = c.req.valid("json");
  const result = await tasksRequest<unknown>(userId, `/api/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

export { tasks };
