import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";
import { upsertCredential, listCredentials, deleteCredential, getCredential, isValidService } from "../services/credentials.js";
import { isUpstreamTimeout } from "../lib/upstream-timeout.js";
import type { AppEnv } from "../types/hono.js";

const credentials = new Hono<AppEnv>();

credentials.use("*", requireAuth);

const upsertSchema = z.object({
  service: z.enum(["project-forge", "agent-tasks", "deploy-panel"]),
  token: z.string().min(1),
  label: z.string().optional(),
});

// GET /credentials — list all (no tokens returned)
credentials.get("/", async (c) => {
  const userId = c.get("userId")!;
  const creds = await listCredentials(userId);
  return c.json({ credentials: creds });
});

// PUT /credentials — upsert a service credential
credentials.put("/", zValidator("json", upsertSchema), async (c) => {
  const userId = c.get("userId")!;
  const { service, token, label } = c.req.valid("json");

  const cred = await upsertCredential(userId, service, token, label);
  return c.json({ credential: cred });
});

// DELETE /credentials/:service
credentials.delete("/:service", async (c) => {
  const userId = c.get("userId")!;
  const service = c.req.param("service");

  if (!isValidService(service)) {
    return c.json({ error: "invalid_service", message: "Unknown service" }, 400);
  }

  try {
    await deleteCredential(userId, service);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "not_found", message: "Credential not found" }, 404);
  }
});

// POST /credentials/validate — test a service connection
const SERVICE_TEST_URLS: Record<string, { url: string; auth: (token: string) => string }> = {
  "project-forge": { url: config.PROJECT_FORGE_URL, auth: (t) => `Bearer ${t}` },
  "agent-tasks": { url: config.AGENT_TASKS_URL, auth: (t) => `Bearer ${t}` },
  "deploy-panel": { url: config.DEPLOY_PANEL_URL, auth: (t) => `Bearer ${t}` },
};

const SERVICE_TEST_PATHS: Record<string, string> = {
  "project-forge": "/api/projects",
  "agent-tasks": "/api/projects/available",
  "deploy-panel": "/api/v1/servers",
};

const validateSchema = z.object({
  service: z.enum(["project-forge", "agent-tasks", "deploy-panel"]),
});

credentials.post("/validate", zValidator("json", validateSchema), async (c) => {
  const userId = c.get("userId")!;
  const { service } = c.req.valid("json");

  const token = await getCredential(userId, service);
  if (!token) {
    return c.json({ valid: false, error: "No token configured" });
  }

  const config = SERVICE_TEST_URLS[service];
  const path = SERVICE_TEST_PATHS[service];

  try {
    const res = await fetch(`${config.url}${path}`, {
      headers: { Authorization: config.auth(token) },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return c.json({ valid: true });
    }
    return c.json({ valid: false, error: res.status === 401 || res.status === 403 ? "Invalid token" : "Service rejected the request" });
  } catch (err) {
    if (isUpstreamTimeout(err)) {
      return c.json({ valid: false, error: "Service timed out" });
    }
    return c.json({ valid: false, error: "Service unreachable" });
  }
});

export { credentials };
