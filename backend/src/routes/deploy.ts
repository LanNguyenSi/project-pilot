import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getCredential } from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const deployTriggerSchema = z.object({
  server: z.string().min(1),
  app: z.string().min(1),
  force: z.boolean().optional(),
});

const rollbackSchema = z.object({
  server: z.string().min(1),
  app: z.string().min(1),
});

// Mirrors deploy-panel's createServerSchema in
// backend/src/routes/servers.ts — keep in sync if that ever changes.
const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  sshKeyPath: z.string().optional(),
  relayUrl: z.string().url().optional(),
  relayToken: z.string().optional(),
});

const deploy = new Hono<AppEnv>();

deploy.use("*", requireAuth);

const DEPLOY_URL = process.env.DEPLOY_PANEL_URL || "https://deploy-panel.opentriologue.ai";

async function deployRequest<T>(userId: string, path: string, options?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const token = await getCredential(userId, "deploy-panel");
  if (!token) {
    return { ok: false, error: "Deploy Panel not configured. Add your API key in Settings.", status: 400 };
  }

  try {
    const res = await fetch(`${DEPLOY_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });

    const body = await res.json() as T;
    if (!res.ok) {
      return { ok: false, error: (body as any).error || (body as any).message || `API error: ${res.status}`, status: res.status };
    }
    return { ok: true, data: body };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Deploy Panel timed out", status: 504 };
    }
    return { ok: false, error: "Deploy Panel unreachable", status: 502 };
  }
}

// GET /deploy/servers
deploy.get("/servers", async (c) => {
  const userId = c.get("userId")!;
  const result = await deployRequest<unknown>(userId, "/api/v1/servers");
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /deploy/servers — add a server. deploy-panel's CRUD lives at
// /api/servers (not /api/v1/servers which is read-only); both accept
// the same Bearer API key so existing credential flow works.
deploy.post("/servers", zValidator("json", createServerSchema), async (c) => {
  const userId = c.get("userId")!;
  const body = c.req.valid("json");
  const result = await deployRequest<unknown>(userId, "/api/servers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data, 201);
});

// DELETE /deploy/servers/:id — remove a server (owner only on the panel side).
deploy.delete("/servers/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const result = await deployRequest<unknown>(userId, `/api/servers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /deploy/apps?server_id=
deploy.get("/apps", async (c) => {
  const userId = c.get("userId")!;
  const serverId = c.req.query("server_id");
  const qs = serverId ? `?server_id=${encodeURIComponent(serverId)}` : "";
  const result = await deployRequest<unknown>(userId, `/api/v1/apps${qs}`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /deploy/trigger — deploy an app
deploy.post("/trigger", zValidator("json", deployTriggerSchema), async (c) => {
  const userId = c.get("userId")!;
  const body = c.req.valid("json");
  const result = await deployRequest<unknown>(userId, "/api/v1/deploy", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /deploy/status/:id — deploy status
deploy.get("/status/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const result = await deployRequest<unknown>(userId, `/api/v1/deploy/${encodeURIComponent(id)}`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /deploy/history — deploy history
deploy.get("/history", async (c) => {
  const userId = c.get("userId")!;
  const params = new URLSearchParams();
  const serverId = c.req.query("server_id");
  const appId = c.req.query("app_id");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 200).toString();
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0).toString();
  if (serverId) params.set("server_id", serverId);
  if (appId) params.set("app_id", appId);
  if (status) params.set("status", status);
  params.set("limit", limit);
  params.set("offset", offset);
  const qs = params.toString() ? `?${params}` : "";
  const result = await deployRequest<unknown>(userId, `/api/v1/deploys${qs}`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /deploy/rollback — rollback
deploy.post("/rollback", zValidator("json", rollbackSchema), async (c) => {
  const userId = c.get("userId")!;
  const body = c.req.valid("json");
  const result = await deployRequest<unknown>(userId, "/api/v1/rollback", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// POST /deploy/preflight — preflight checks
deploy.post("/preflight", zValidator("json", deployTriggerSchema), async (c) => {
  const userId = c.get("userId")!;
  const body = c.req.valid("json");
  const result = await deployRequest<unknown>(userId, "/api/v1/preflight", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /deploy/logs — app logs
deploy.get("/logs", async (c) => {
  const userId = c.get("userId")!;
  const server = c.req.query("server");
  const app = c.req.query("app");
  const lines = c.req.query("lines") || "50";
  if (!server || !app) return c.json({ error: "server and app params required" }, 400);
  const params = new URLSearchParams({ server, app, lines });
  const result = await deployRequest<unknown>(userId, `/api/v1/logs?${params}`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

export { deploy };
