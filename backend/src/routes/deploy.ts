import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { config } from "../config/index.js";
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

// Mirror of deploy-panel's sshAuthSchema (servers.ts) + core identity fields
// from installRelaySchema. Like deploy-panel, exactly one of sshPassword /
// sshPrivateKey is required (XOR) so "both provided" is rejected here with a
// clear local 400 instead of a confusing late 400 from deploy-panel. Advanced
// relay fields (relayDomain / traefikEmail / relayMode / etc.) are intentionally
// omitted — deploy-panel applies its own defaults. SSH credentials live only in
// the parsed-body variable for the duration of the handler and are never
// persisted or logged.
const installRelayBodySchema = z
  .object({
    name: z.string().min(1).max(100),
    host: z.string().min(1).max(255),
    sshUser: z.string().min(1).max(64).default("root"),
    sshPort: z.number().int().min(1).max(65535).default(22),
    sshPassword: z.string().min(1).optional(),
    sshPrivateKey: z.string().min(1).optional(),
    sshPassphrase: z.string().min(1).optional(),
  })
  .refine(
    (v) => Boolean(v.sshPassword) !== Boolean(v.sshPrivateKey),
    { message: "Provide exactly one of sshPassword or sshPrivateKey" },
  );

// Subset of deploy-panel's createServerSchema in backend/src/routes/servers.ts.
// sshKeyPath is intentionally omitted: deploy-panel stores it but sanitizeServer
// strips it from every response and no SSH operation ever reads it (dead field),
// and deploy-panel's own Add Server form no longer collects it. Keep name/host/
// relay* in sync if that schema changes.
const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1).max(255),
  relayUrl: z.string().url().optional(),
  relayToken: z.string().optional(),
});

const deploy = new Hono<AppEnv>();

deploy.use("*", requireAuth);

const DEPLOY_URL = config.DEPLOY_PANEL_URL;

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

// POST /deploy/install-relay — stream SSE relay-install progress from
// deploy-panel. SSH credentials (sshPassword / sshPrivateKey / sshPassphrase)
// are forwarded in the proxied request body and are NEVER written to the DB,
// written to any log, or included in error responses. They exist only in the
// `body` variable for the lifetime of this handler.
deploy.post(
  "/install-relay",
  zValidator("json", installRelayBodySchema),
  async (c) => {
    const userId = c.get("userId")!;
    const body = c.req.valid("json");

    const dpToken = await getCredential(userId, "deploy-panel");
    if (!dpToken) {
      return c.json(
        {
          error: "deploy_panel_not_connected",
          message: "Connect deploy-panel first in Settings.",
        },
        409,
      );
    }

    // No AbortSignal.timeout — the relay install can run up to ~10 min.
    // Client disconnect is handled by wiring the incoming request signal so
    // fetch is cancelled automatically when the browser closes the connection.
    let upstream: Response;
    try {
      upstream = await fetch(`${DEPLOY_URL}/api/servers/install-relay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dpToken}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: c.req.raw.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return c.json({ error: "aborted", message: "Request aborted" }, 499 as any);
      }
      return c.json(
        { error: "deploy_panel_unreachable", message: "deploy-panel is unreachable" },
        502,
      );
    }

    if (!upstream.ok) {
      let message: string;
      try {
        const errBody = (await upstream.json()) as { error?: string; message?: string };
        message = errBody.message || errBody.error || `upstream error ${upstream.status}`;
      } catch {
        message = `upstream error ${upstream.status}`;
      }
      return c.json({ error: "install_relay_failed", message }, upstream.status as any);
    }

    // Pass through the deploy-panel SSE stream verbatim. @hono/node-server
    // streams a ReadableStream body without buffering. X-Accel-Buffering: no
    // disables nginx proxy buffering so the browser receives events
    // incrementally rather than in a single flush at stream end.
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  },
);

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
