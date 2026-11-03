/**
 * GET /api/health proves the schema, not just the connection: SELECT 1 alone
 * answers 200 against a database with no tables, so a deploy whose schema step
 * never ran looks healthy. The route reads the User table (the table every
 * schema creates, the others reference it) after the ping, reports the missing
 * table separately from a database that does not answer, and keeps the ok case
 * exactly as it was for the healthchecks that poll it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  prisma: { $queryRaw: vi.fn(), user: { findFirst: vi.fn() } },
}));

import { prisma } from "../src/lib/prisma.js";
import { app } from "../src/app.js";

const ping = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const findUser = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;

const p2021 = Object.assign(new Error("The table `public.User` does not exist"), {
  code: "P2021",
});

function get() {
  return app.request("/api/health");
}

beforeEach(() => {
  ping.mockReset();
  findUser.mockReset();
});

describe("GET /api/health", () => {
  it("answers 200 ok/connected when the database answers and the table is there", async () => {
    ping.mockResolvedValue([{ "?column?": 1 }]);
    findUser.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "connected" });
  });

  it("proves the schema with a read of the User table only", async () => {
    ping.mockResolvedValue([{ "?column?": 1 }]);
    findUser.mockResolvedValue({ id: "user-a" });
    const res = await get();
    expect(res.status).toBe(200);
    expect(findUser).toHaveBeenCalledTimes(1);
    expect(findUser).toHaveBeenCalledWith({ select: { id: true } });
  });

  it("answers 503 disconnected when the database does not answer, without touching the table", async () => {
    ping.mockRejectedValue(new Error("Can't reach database server"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "disconnected" });
    expect(findUser).not.toHaveBeenCalled();
  });

  it("answers 503 schema_missing when the table is missing", async () => {
    ping.mockResolvedValue([{ "?column?": 1 }]);
    findUser.mockRejectedValue(p2021);
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "schema_missing" });
  });

  it("keeps a non-P2021 failure on the table at disconnected, not schema_missing", async () => {
    ping.mockResolvedValue([{ "?column?": 1 }]);
    findUser.mockRejectedValue(
      Object.assign(new Error("too many connections"), { code: "P2024" }),
    );
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "disconnected" });
  });

  it("keeps a failure without a Prisma error code at disconnected", async () => {
    ping.mockResolvedValue([{ "?column?": 1 }]);
    findUser.mockRejectedValue(new Error("connection terminated"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", db: "disconnected" });
  });
});
