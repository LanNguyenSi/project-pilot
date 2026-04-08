import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getCredential } from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const forge = new Hono<AppEnv>();

forge.use("*", requireAuth);

const FORGE_URL = process.env.PROJECT_FORGE_URL || "https://project-forge.opentriologue.ai";

async function forgeRequest<T>(userId: string, path: string, options?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const token = await getCredential(userId, "project-forge");
  if (!token) {
    return { ok: false, error: "Project Forge not configured. Add your API key in Settings.", status: 400 };
  }

  try {
    const res = await fetch(`${FORGE_URL}${path}`, {
      ...options,
      headers: {
        "X-API-Key": token,
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: AbortSignal.timeout(60_000), // generation can take a while
    });

    const body = await res.json() as T & { ok?: boolean; error?: string };

    if (!res.ok || body.ok === false) {
      return { ok: false, error: (body as any).error || `Forge API error: ${res.status}`, status: res.status };
    }

    return { ok: true, data: body };
  } catch {
    return { ok: false, error: "Project Forge unreachable", status: 502 };
  }
}

// GET /forge/projects — list created projects
forge.get("/projects", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const result = await forgeRequest<{ projects: unknown[]; total: number }>(userId, "/api/v1/projects");
  if (!result.ok) return c.json({ error: result.error }, result.status as any);

  return c.json(result.data);
});

const generateSchema = z.object({
  projectName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  summary: z.string().min(1),
  features: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  targetUsers: z.array(z.string()).optional(),
});

// POST /forge/generate — generate preview
forge.post("/generate", zValidator("json", generateSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const body = c.req.valid("json");
  const result = await forgeRequest<{ sessionId: string; preview: unknown }>(userId, "/api/v1/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// GET /forge/preview?sessionId= — get preview data
forge.get("/preview", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const sessionId = c.req.query("sessionId");
  if (!sessionId) return c.json({ error: "Missing sessionId" }, 400);

  const result = await forgeRequest<{ sessionId: string; preview: unknown }>(userId, `/api/v1/preview?sessionId=${sessionId}`);
  if (!result.ok) return c.json({ error: result.error }, result.status as any);

  return c.json(result.data);
});

// POST /forge/publish — publish a previewed project
forge.post("/publish", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const { sessionId } = await c.req.json() as { sessionId?: string };
  if (!sessionId) return c.json({ error: "Missing sessionId" }, 400);

  const result = await forgeRequest<{ result: { repoUrl: string; cloneUrl: string; projectName: string } }>(userId, "/api/v1/publish", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });

  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

export { forge };
