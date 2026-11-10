import { describe, it, expect, vi, beforeEach } from "vitest";

// The real rate limiter is used here (credentials.test.ts mocks it away).

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

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    serviceCredential: {
      upsert: vi.fn(async () => ({ id: "c1", service: "agent-tasks", label: null, updatedAt: new Date() })),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// The test picks the user per request through a header.
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("userId", c.req.header("x-test-user"));
    await next();
  }),
}));

import { credentials } from "../src/routes/credentials.js";

let ipCounter = 0;

function put(body: unknown, user: string, ip: string) {
  return credentials.request("/", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-test-user": user, "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const valid = { service: "agent-tasks", token: "tok" };

describe("PUT /credentials input bounds", () => {
  let ip: string;
  beforeEach(() => {
    ip = `198.51.100.${++ipCounter}`;
  });

  it("accepts a token of exactly 4096 characters", async () => {
    const res = await put({ ...valid, token: "a".repeat(4096) }, "bounds-user-1", ip);
    expect(res.status).toBe(200);
  });

  it("rejects a token longer than 4096 characters with 400", async () => {
    const res = await put({ ...valid, token: "a".repeat(4097) }, "bounds-user-2", ip);
    expect(res.status).toBe(400);
  });

  it("accepts a label of exactly 200 characters", async () => {
    const res = await put({ ...valid, label: "l".repeat(200) }, "bounds-user-3", ip);
    expect(res.status).toBe(200);
  });

  it("rejects a label longer than 200 characters with 400", async () => {
    const res = await put({ ...valid, label: "l".repeat(201) }, "bounds-user-4", ip);
    expect(res.status).toBe(400);
  });
});

describe("PUT /credentials rate limit", () => {
  it("answers the 11th write of one user within the window with 429", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 10; i++) {
      expect((await put(valid, "limit-user-a", ip)).status).toBe(200);
    }
    const res = await put(valid, "limit-user-a", ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests. Please try again later.",
    });
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("limits per user across source addresses, and leaves another user alone", async () => {
    // Ten writes by user b from ten different addresses: no IP bucket fills up,
    // so only the per-user bucket can produce the 429.
    for (let i = 0; i < 10; i++) {
      expect((await put(valid, "limit-user-b", `203.0.113.${100 + i}`)).status).toBe(200);
    }
    expect((await put(valid, "limit-user-b", "203.0.113.200")).status).toBe(429);
    // Another user from a fresh address is not affected.
    expect((await put(valid, "limit-user-c", "203.0.113.201")).status).toBe(200);
  });

  it("does not rate-limit GET /credentials", async () => {
    for (let i = 0; i < 12; i++) {
      const res = await credentials.request("/", {
        method: "GET",
        headers: { "x-test-user": "limit-user-d", "x-forwarded-for": "203.0.113.50" },
      });
      expect(res.status).not.toBe(429);
    }
  });
});
