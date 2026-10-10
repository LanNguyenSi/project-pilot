/**
 * Adapter-level tests (task 7770188e): the real `app` from src/app.ts is served
 * through serve() from @hono/node-server on an ephemeral loopback port, so the
 * adapter's socket binding is covered. Every other suite calls app.request()
 * directly, where getConnInfo has no socket and the rate limiter falls back to
 * the "unknown" key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/index.js", () => ({
  config: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    PORT: 3001,
    CORS_ORIGINS: "http://localhost:3000",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    NODE_ENV: "test",
    PROJECT_FORGE_URL: "http://localhost:3002",
    AGENT_TASKS_URL: "http://localhost:3003",
    DEPLOY_PANEL_URL: "http://localhost:3004",
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));

// Imported after vi.mock so the app receives the mocked config and prisma.
import { app } from "../src/app.js";
import { startNodeServer, type RunningServer } from "./helpers/node-server.js";

let running: RunningServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

const REGISTER_HEADERS = {
  "content-type": "application/json",
  "x-requested-with": "XMLHttpRequest",
};

describe("node-server adapter: JSON round trip", () => {
  it("GET /api/health answers JSON over a real socket", async () => {
    running = await startNodeServer(app);
    const res = await fetch(`${running.url}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ status: "ok", db: "connected" });
  });
});

describe("node-server adapter: peer address", () => {
  it("the rate limiter keys on the real peer address, not the 'unknown' fallback", async () => {
    // The limiter store is module-global and keyed `ip:${ip}:${path}`; register
    // allows 5 requests per minute. Five socket requests fill the bucket of the
    // real loopback address, so the sixth is limited. A request without a
    // socket (app.request) is keyed `ip:unknown:...`; if the socket requests had
    // also been keyed 'unknown', that request would be the seventh hit in the
    // same bucket and get 429. A 400 there proves the buckets differ.
    running = await startNodeServer(app);
    const viaSocket = () =>
      fetch(`${running!.url}/api/auth/register`, {
        method: "POST",
        headers: REGISTER_HEADERS,
        body: JSON.stringify({}),
      });

    for (let i = 0; i < 5; i++) {
      expect((await viaSocket()).status).toBe(400);
    }
    expect((await viaSocket()).status).toBe(429);

    const noSocket = await app.request("/api/auth/register", {
      method: "POST",
      headers: REGISTER_HEADERS,
      body: JSON.stringify({}),
    });
    expect(noSocket.status).toBe(400);
  });

  it("an X-Forwarded-For hop still takes precedence over the socket address", async () => {
    running = await startNodeServer(app);
    const send = (xff: string) =>
      fetch(`${running!.url}/api/auth/register`, {
        method: "POST",
        headers: { ...REGISTER_HEADERS, "x-forwarded-for": xff },
        body: JSON.stringify({}),
      });
    // A fresh client address gets its own bucket even though every request
    // arrives from the same loopback socket that the previous test exhausted.
    expect((await send("203.0.113.77")).status).toBe(400);
  });
});
