import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getCredential } from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const forge = new Hono<AppEnv>();

forge.use("*", requireAuth);

const FORGE_URL = process.env.PROJECT_FORGE_URL || "https://project-forge.opentriologue.ai";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      signal: AbortSignal.timeout(60_000),
    });

    const body = await res.json() as T & { ok?: boolean; error?: string };

    if (!res.ok || body.ok === false) {
      return { ok: false, error: (body as any).error || `Forge API error: ${res.status}`, status: res.status };
    }

    return { ok: true, data: body };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Generation timed out. Please try again.", status: 504 };
    }
    return { ok: false, error: "Project Forge unreachable", status: 502 };
  }
}

// GET /forge/projects — list created projects
forge.get("/projects", async (c) => {
  const userId = c.get("userId")!;
  const result = await forgeRequest<{ projects: unknown[]; total: number }>(userId, "/api/v1/projects");
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

// DELETE /forge/projects/:id — soft-delete a project
forge.delete("/projects/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const result = await forgeRequest<{ ok: boolean }>(userId, `/api/v1/projects?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

const generateSchema = z.object({
  projectName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  summary: z.string().min(1).max(2000),
  features: z.array(z.string().max(500)).max(20).optional(),
  constraints: z.array(z.string().max(500)).max(20).optional(),
  targetUsers: z.array(z.string().max(500)).max(20).optional(),
});

// POST /forge/generate — generate preview
forge.post("/generate", zValidator("json", generateSchema), async (c) => {
  const userId = c.get("userId")!;
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
  const userId = c.get("userId")!;
  const sessionId = c.req.query("sessionId");
  if (!sessionId || !UUID_RE.test(sessionId)) {
    return c.json({ error: "Missing or invalid sessionId" }, 400);
  }

  const result = await forgeRequest<{ sessionId: string; preview: unknown }>(
    userId,
    `/api/v1/preview?sessionId=${encodeURIComponent(sessionId)}`,
  );
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

const publishSchema = z.object({
  sessionId: z.string().regex(UUID_RE, "Invalid sessionId"),
});

// POST /forge/publish — publish a previewed project
forge.post("/publish", zValidator("json", publishSchema), async (c) => {
  const userId = c.get("userId")!;
  const { sessionId } = c.req.valid("json");

  const result = await forgeRequest<{ result: { repoUrl: string; cloneUrl: string; projectName: string } }>(userId, "/api/v1/publish", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });

  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

export { forge };
