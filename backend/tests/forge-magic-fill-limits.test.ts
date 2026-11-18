import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The real rate limiter is used here (forge-routes.test.ts mocks it away).
// Every bucket key carries the request path, so these buckets never collide
// with the /credentials buckets other suites would share if they could.

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    PROJECT_FORGE_URL: "http://forge.test",
    AGENT_TASKS_URL: "http://tasks.test",
    DEPLOY_PANEL_URL: "http://deploy.test",
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/services/credentials.js", () => ({
  getCredential: vi.fn(),
}));

vi.mock("../src/services/forge-task-snapshot.js", () => ({
  extractPreviewTasks: vi.fn(),
  saveForgeTaskSnapshot: vi.fn(),
  linkForgeSnapshotToRepo: vi.fn(),
}));

vi.mock("../src/services/forge-task-migration.js", () => ({
  migrateForgeTasks: vi.fn(),
}));

// The test picks the user per request through a header.
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("userId", c.req.header("x-test-user"));
    await next();
  }),
}));

import { forge } from "../src/routes/forge.js";

function magicFill(user: string, ip: string, prompt = "Build a todo app") {
  return forge.request("/ai-assist/magic-fill", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-user": user,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ prompt }),
  });
}

describe("POST /forge/ai-assist/magic-fill rate limit", () => {
  beforeEach(() => {
    // The route proxies to the forge AI endpoint; answer it locally so the
    // only thing that can reject a call is the limiter. A fresh Response per
    // call: a consumed body cannot be json()-parsed twice.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: { projectName: "todo-app", summary: "A todo app", features: [] },
              provider: "groq",
              model: "llama3-8b-8192",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers the 11th magic-fill of one user within the window with 429", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 10; i++) {
      expect((await magicFill("mf-user-a", ip)).status).toBe(200);
    }
    const res = await magicFill("mf-user-a", ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests. Please try again later.",
    });
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("limits per user across source addresses, and leaves another user alone", async () => {
    // Ten calls by user b from ten different addresses: no IP bucket fills
    // up, so only the per-user bucket can produce the 429.
    for (let i = 0; i < 10; i++) {
      expect((await magicFill("mf-user-b", `203.0.113.${100 + i}`)).status).toBe(200);
    }
    expect((await magicFill("mf-user-b", "203.0.113.200")).status).toBe(429);
    // Another user from a fresh address is not affected.
    expect((await magicFill("mf-user-c", "203.0.113.201")).status).toBe(200);
  });

  it("the IP bucket limits on its own: many users from one address hit it too", async () => {
    // Ten different users, one call each, all from the same address: every
    // per-user bucket holds 1, so only the shared IP bucket can fill up.
    for (let i = 0; i < 10; i++) {
      expect((await magicFill(`mf-ip-user-${i}`, "203.0.113.30")).status).toBe(200);
    }
    // The 11th call from that address is 429 even for a brand-new user whose
    // per-user bucket is at 1: the limiter checks the IP bucket first and
    // short-circuits the key generator once it is breached, so whichever
    // bucket crosses first wins, and with equal maxima the shared IP
    // bucket does here.
    expect((await magicFill("mf-ip-user-fresh", "203.0.113.30")).status).toBe(429);
  });

  it("counts invalid bodies against the quota: the limiter runs before validation", async () => {
    // The limiter-before-validation order is what stops a client from
    // probing the schema or flooding with invalid bodies for free. Ten
    // empty-prompt calls from one user across fresh addresses are all
    // 400, but each one has already passed the limiter, so the 11th
    // (valid body, fresh address) answers 429, not 400 or 200.
    for (let i = 0; i < 10; i++) {
      expect((await magicFill("mf-user-d", `198.51.100.${i}`, "")).status).toBe(400);
    }
    expect((await magicFill("mf-user-d", "198.51.100.99")).status).toBe(429);
  });

  it("does not rate-limit GET /ai-assist/capabilities", async () => {
    for (let i = 0; i < 12; i++) {
      const res = await forge.request("/ai-assist/capabilities", {
        headers: { "x-test-user": "mf-user-e", "x-forwarded-for": "203.0.113.50" },
      });
      expect(res.status).not.toBe(429);
    }
  });
});
