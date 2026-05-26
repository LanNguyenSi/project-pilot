import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getCredential } from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const forge = new Hono<AppEnv>();

forge.use("*", requireAuth);

const FORGE_URL = config.PROJECT_FORGE_URL;

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

// ── AI Magic Fill ──────────────────────────────────────────────────────────
// Proxies to project-forge's `/api/ai-assist` route. That route is public
// (no X-API-Key) and reads its own LOCAL_AI_BASE_URL / GROQ_API_KEY /
// OPENAI_API_KEY env on the forge side. We deliberately bypass
// `forgeRequest` here: a user who hasn't configured a forge credential
// yet can still try the magic-fill UI, and will only hit the credential
// wall when they actually click Generate.

async function forgeAiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(`${FORGE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json() as T & { ok?: boolean; error?: string };
    if (!res.ok || (body as any).ok === false) {
      return { ok: false, error: (body as any).error || `Forge AI error: ${res.status}`, status: res.status };
    }
    return { ok: true, data: body };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "AI request timed out. Please try again.", status: 504 };
    }
    return { ok: false, error: "Project Forge unreachable", status: 502 };
  }
}

// GET /forge/ai-assist/capabilities — whether magic-fill is available
forge.get("/ai-assist/capabilities", async (c) => {
  const result = await forgeAiRequest<{
    enabled: boolean;
    provider: string | null;
    model: string | null;
    features: { magicFill: boolean; intakeEnrichment: boolean; postScaffoldReview: boolean };
  }>("/api/ai-assist");
  if (!result.ok) {
    // Degrade gracefully: if forge is unreachable, magic-fill is just
    // unavailable — don't surface a 502 to the UI on every page load.
    // Log the underlying error so ops can still see forge-down in server
    // logs without every client seeing a failure banner.
    console.warn(`[forge] ai-assist capabilities unreachable: ${result.error}`);
    return c.json({ enabled: false, provider: null, model: null, features: { magicFill: false } });
  }
  return c.json(result.data);
});

const magicFillSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000, "Prompt too long"),
});

// POST /forge/ai-assist/magic-fill — ask the AI to fill project form fields
forge.post("/ai-assist/magic-fill", zValidator("json", magicFillSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await forgeAiRequest<{
    ok: true;
    data: {
      projectName: string;
      summary: string;
      features: string[];
      constraints?: string[];
      targetUsers?: string[];
    };
    provider: string;
    model: string;
  }>("/api/ai-assist", {
    method: "POST",
    body: JSON.stringify({ prompt: body.prompt }),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status as any);
  return c.json(result.data);
});

export { forge };
