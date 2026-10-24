import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * End-to-end pin for repoUrl whitespace passthrough on POST /forge/migrate-tasks.
 *
 * Runs the route against the REAL forge-task-migration service (only prisma
 * and the agent-tasks client are mocked) so the response, not just the
 * forwarded value, is pinned. On the zod 3 base the body value was passed to
 * the service unchanged: `parseOwnerRepo` reads the trailing newline into the
 * owner/repo capture ("o/r\n"), so the snapshot lookup keyed on that raw form
 * misses and the request ends as 400 no_snapshot, never reaching agent-tasks.
 * (It is NOT 400 invalid_repo: the parseOwnerRepo regex class `[^/]` matches
 * `\n`, so the trailing newline parses as part of the repo name.) If the
 * schema normalized the value the way zod 4 `z.url()` does, the lookup would
 * hit the snapshot stored for the clean URL and the migration would run, so
 * this test also pins that a stray newline cannot smuggle a different URL
 * into the migration path.
 */

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set?.("userId", "user-1");
    await next();
  }),
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
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/services/credentials.js", () => ({
  getCredential: vi.fn(async () => "forge-token"),
}));

vi.mock("../src/services/agent-tasks-client.js", () => ({
  agentTasksRequest: vi.fn(async () => ({ ok: false, status: 502, error: "unreachable" })),
}));

// Realistic fixture: a snapshot row exists only for the canonical key of the
// clean URL (repoKey("https://github.com/o/r") === "o/r").
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    forgeTaskSnapshot: {
      findFirst: vi.fn(async (args: { where: { repoUrl: string } }) =>
        args.where.repoUrl === "o/r" ? { tasks: [] } : null,
      ),
    },
  },
}));

import { forge } from "../src/routes/forge.js";
import { agentTasksRequest } from "../src/services/agent-tasks-client.js";

const mockTasksRequest = vi.mocked(agentTasksRequest);

function postMigrate(body: unknown) {
  return forge.request("/migrate-tasks", {
    method: "POST",
    headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /forge/migrate-tasks repoUrl output identity (real service)", () => {
  it('rejects repoUrl "https://github.com/o/r\\n" with 404 no_snapshot, exactly as on the zod 3 base', async () => {
    const res = await postMigrate({ repoUrl: "https://github.com/o/r\n" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: expect.any(String), code: "no_snapshot" });
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });

  it('discriminator: the clean repoUrl "https://github.com/o/r" does find the snapshot and reaches agent-tasks', async () => {
    const res = await postMigrate({ repoUrl: "https://github.com/o/r" });
    expect(res.status).toBe(502);
    expect(mockTasksRequest).toHaveBeenCalled();
  });
});
