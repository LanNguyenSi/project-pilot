import { describe, it, expect, vi } from "vitest";

/**
 * Pins app.ts onError's ZodError branch through the REAL app after the
 * zod 4 migration: a ZodError thrown from a service must produce status 400
 * and the encoded body { error: "Validation failed", issues: string[] }
 * (issues rendered as "path.join("."): message"), exactly as in zod 3.
 *
 * The thrown error is produced by zod itself (safeParse), not hand-built:
 * in zod 4 a hand-constructed `new ZodError(issues)` is not `instanceof
 * Error` and would never reach Hono's onError, while parse-produced errors
 * are real Errors.
 */

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
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/lib/prisma.js", async () => {
  const { z } = await import("zod");
  const parseError = z
    .object({ a: z.object({ b: z.string() }) })
    .safeParse({ a: { b: 1 } }).error!;
  return {
    prisma: {
      session: {
        findUnique: vi.fn(async () => ({
          id: "sess-1",
          tokenHash: "x",
          expiresAt: new Date(Date.now() + 3_600_000),
          user: { id: "user-1", email: "t@example.com", name: "T" },
        })),
        delete: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      serviceCredential: {
        findUnique: vi.fn(async () => {
          throw parseError;
        }),
        findMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      passwordReset: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    },
  };
});

import { app } from "../src/app.js";

describe("app.onError ZodError branch (zod 4)", () => {
  it("renders a parse-produced ZodError as { error, issues: string[] } with 400", async () => {
    const res = await app.request("/api/tasks/task-1", {
      method: "GET",
      headers: { Cookie: "session=opaque-token" },
    });
    expect(res.status).toBe(400);
    const body = JSON.parse(await res.text());
    expect(Object.keys(body).sort()).toEqual(["error", "issues"]);
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBe(1);
    expect(typeof body.issues[0]).toBe("string");
    // Path joined with "." then ": message", same rendering as before.
    expect(body.issues[0]).toMatch(/^a\.b: .+$/);
  });
});
