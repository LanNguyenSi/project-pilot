import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * MUTATION COVERAGE: app.ts registers requestBodyLimit (middleware/body-limit.ts)
 * globally, before the routes and before the rate-limit key generators.
 *
 * Mutation A, remove the app.use("*", requestBodyLimit) line:
 *   the over-limit tests receive 403 (csrf) or 401/400 instead of 413.
 * Mutation B, move it after the app.route(...) calls:
 *   routes answer first, same failures as A, and keyGenerator runs.
 * Mutation C, raise MAX_BODY_BYTES (e.g. 10x):
 *   the "just over the limit" tests receive a non-413 status.
 * Mutation D, lower MAX_BODY_BYTES below the largest legitimate body:
 *   the "just under the limit" tests receive 413.
 * Mutation E, replace bodyLimit's onError with the default (text body):
 *   the JSON error-shape assertion fails.
 */

const keyGeneratorCalls = vi.hoisted(() => ({ n: 0 }));

// The real keyGenerator (emailKey) reads the JSON body; count its invocations
// to prove the limit runs before it.
vi.mock("../src/middleware/rate-limit.js", () => ({
  rateLimit: (opts: { keyGenerator?: (c: unknown) => Promise<string | undefined> }) =>
    async (c: unknown, next: () => Promise<void>) => {
      if (opts.keyGenerator) {
        keyGeneratorCalls.n++;
        await opts.keyGenerator(c);
      }
      await next();
    },
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    session: { create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
    passwordReset: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    serviceCredential: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    DATABASE_URL: "postgresql://test",
    CORS_ORIGINS: "http://localhost:3000",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    PORT: 3001,
    PROJECT_FORGE_URL: "https://forge.test",
    AGENT_TASKS_URL: "https://agent-tasks.test",
    DEPLOY_PANEL_URL: "https://deploy-panel.test",
    ALLOW_FIRST_PASSWORD_ACCOUNT: false,
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/services/auth.js", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  generateSessionToken: vi.fn(),
  hashToken: vi.fn(),
  hashPassword: vi.fn(),
  AuthError: class AuthError extends Error {
    code = "x";
  },
}));

import { app } from "../src/app.js";
import { loginUser } from "../src/services/auth.js";
import { MAX_BODY_BYTES } from "../src/middleware/body-limit.js";

const mockLoginUser = vi.mocked(loginUser);

// Pad a valid-shaped JSON object to exactly `bytes` bytes (ASCII only).
function jsonOfSize(bytes: number): string {
  const prefix = '{"email":"a@example.com","password":"';
  const suffix = '"}';
  return prefix + "x".repeat(bytes - prefix.length - suffix.length) + suffix;
}

const headers = { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" };

function chunked(text: string, chunkSize = 16 * 1024): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

function postChunked(path: string, text: string, extra: Record<string, string> = headers) {
  return app.request(path, {
    method: "POST",
    headers: extra,
    body: chunked(text),
    // @ts-expect-error duplex is required for stream bodies and missing from RequestInit typings
    duplex: "half",
  });
}

beforeEach(() => {
  keyGeneratorCalls.n = 0;
  mockLoginUser.mockReset();
});

describe("global request body limit", () => {
  it("limit is 128 KiB", () => {
    expect(MAX_BODY_BYTES).toBe(131072);
  });

  it("1 MiB JSON to /api/auth/login answers 413 and nothing downstream runs", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body: jsonOfSize(1024 * 1024),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
    expect(keyGeneratorCalls.n).toBe(0);
    expect(mockLoginUser).not.toHaveBeenCalled();
  });

  it("413 is answered before CSRF (no X-Requested-With needed)", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: jsonOfSize(MAX_BODY_BYTES + 1),
    });
    expect(res.status).toBe(413);
  });

  it("one byte over the limit is rejected, exactly at the limit passes", async () => {
    const over = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body: jsonOfSize(MAX_BODY_BYTES + 1),
    });
    expect(over.status).toBe(413);

    const at = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body: jsonOfSize(MAX_BODY_BYTES),
    });
    // Passed the limit: the validator rejects the 128 KiB password (max 128).
    expect(at.status).toBe(400);
    expect(keyGeneratorCalls.n).toBe(1);
    expect(mockLoginUser).not.toHaveBeenCalled();
  });

  it("a normal body just under the limit reaches the handler", async () => {
    mockLoginUser.mockRejectedValueOnce(new Error("invalid"));
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "a@example.com", password: "pw" }),
    });
    expect(res.status).not.toBe(413);
    expect(keyGeneratorCalls.n).toBe(1);
    expect(mockLoginUser).toHaveBeenCalledTimes(1);
  });

  it("chunked over-limit body without Content-Length answers 413", async () => {
    const res = await postChunked("/api/auth/login", jsonOfSize(1024 * 1024));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
    expect(keyGeneratorCalls.n).toBe(0);
    expect(mockLoginUser).not.toHaveBeenCalled();
  });

  it("chunked body without Content-Length is really chunked in this test", async () => {
    const req = new Request("http://localhost/x", {
      method: "POST",
      body: chunked("{}"),
      // @ts-expect-error duplex
      duplex: "half",
    });
    expect(req.headers.has("content-length")).toBe(false);
  });

  it("chunked body just under the limit passes the limit", async () => {
    const res = await postChunked("/api/auth/login", jsonOfSize(MAX_BODY_BYTES));
    expect(res.status).toBe(400);
    expect(keyGeneratorCalls.n).toBe(1);
  });

  it("applies to other routes too (forgot-password, tasks)", async () => {
    const forgot = await app.request("/api/auth/forgot-password", {
      method: "POST",
      headers,
      body: jsonOfSize(MAX_BODY_BYTES + 1),
    });
    expect(forgot.status).toBe(413);
    expect(keyGeneratorCalls.n).toBe(0);

    const tasks = await app.request("/api/tasks/projects", {
      method: "POST",
      headers,
      body: jsonOfSize(MAX_BODY_BYTES + 1),
    });
    expect(tasks.status).toBe(413);
  });
});
