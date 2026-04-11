import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
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

const tasks = new Hono<AppEnv>();

tasks.use("*", requireAuth);

const TASKS_URL = process.env.AGENT_TASKS_URL || "https://agent-tasks.opentriologue.ai";

async function tasksRequest<T>(userId: string, path: string, options?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const token = await getCredential(userId, "agent-tasks");
  if (!token) {
    return { ok: false, error: "Agent Tasks not configured. Add your token in Settings.", status: 400 };
  }

  try {
    const res = await fetch(`${TASKS_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: AbortSignal.timeout(10_000),
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
