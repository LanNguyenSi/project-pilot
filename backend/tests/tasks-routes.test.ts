import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * MUTATION COVERAGE — tasks.ts proxy routes.
 *
 *   Guard F (per-route auth gate): `tasks.use("*", requireAuth)`
 *     Mutation: remove middleware application → unauthenticated requests reach handlers
 *     Killed by: auth gate tests that expect 401 when requireAuth returns 401.
 *
 *   Guard G (userId threading): `const userId = c.get("userId")!` passed to agentTasksRequest
 *     Mutation: use wrong/hardcoded userId → agentTasksRequest called with wrong first arg
 *     Killed by: assertions on the first argument of each agentTasksRequest call.
 *
 *   Guard H (proxy path/method/body shape):
 *     Mutation: wrong path, wrong HTTP method, or garbled body → assertion on call args fails
 *     Killed by: exact path/options assertion on each handler's agentTasksRequest call.
 */

vi.mock("../src/middleware/rate-limit.js", () => ({
  rateLimit: () => (_c: any, next: any) => next(),
}));

// Mock requireAuth as a spy so individual tests can override it.
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set?.("userId", "user-a");
    await next();
  }),
}));

// Mock the entire agent-tasks-client module so no real fetch / credential lookup occurs.
vi.mock("../src/services/agent-tasks-client.js", () => ({
  agentTasksRequest: vi.fn(),
}));

import { requireAuth } from "../src/middleware/auth.js";
import { agentTasksRequest } from "../src/services/agent-tasks-client.js";
import { tasks } from "../src/routes/tasks.js";

const mockRequireAuth = vi.mocked(requireAuth);
const mockTasksRequest = vi.mocked(agentTasksRequest);

// Default success response for agentTasksRequest
const OK_RESULT = { ok: true as const, data: { items: [] } };

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRequest(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
) {
  return tasks.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Auth gate (Guard F) ─────────────────────────────────────────────────────

describe("tasks routes — auth gate (Guard F: tasks.use('*', requireAuth))", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: inject userId
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
  });

  it("GET /projects — unauthenticated → 401, agentTasksRequest never called", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any) =>
      c.json({ error: "unauthorized" }, 401),
    );

    const res = await makeRequest("/projects");
    expect(res.status).toBe(401);
    // GUARD F — mutation: remove middleware → handler runs, agentTasksRequest called → this fails
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });

  it("POST /projects — unauthenticated → 401, agentTasksRequest never called", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any) =>
      c.json({ error: "unauthorized" }, 401),
    );

    const res = await makeRequest("/projects", "POST", {
      name: "Test",
      slug: "test",
      teamId: "00000000-0000-0000-0000-000000000001",
    });
    expect(res.status).toBe(401);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });
});

// ─── GET /projects (Guard G + H) ────────────────────────────────────────────

describe("GET /projects — list available projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
    mockTasksRequest.mockResolvedValue(OK_RESULT);
  });

  it("calls agentTasksRequest with correct userId and path (Guards G + H)", async () => {
    await makeRequest("/projects");

    // GUARD G: first arg must be caller's userId
    // GUARD H: second arg must be the correct upstream path
    expect(mockTasksRequest).toHaveBeenCalledWith(
      "user-a",
      "/api/projects/available",
    );
  });

  it("proxies the upstream payload as the response body → 200", async () => {
    mockTasksRequest.mockResolvedValue({ ok: true, data: { projects: ["p1"] } });

    const res = await makeRequest("/projects");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: unknown[] };
    expect(body.projects).toEqual(["p1"]);
  });

  it("propagates upstream error status and message → error response", async () => {
    mockTasksRequest.mockResolvedValue({
      ok: false,
      error: "agent_tasks_down",
      status: 502,
    });

    const res = await makeRequest("/projects");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("agent_tasks_down");
  });

  it("routes different userId to agentTasksRequest (user isolation)", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any, next: any) => {
      c.set?.("userId", "user-b");
      await next();
    });

    await makeRequest("/projects");

    // GUARD G — mutation: use hardcoded userId → first arg != "user-b" → fails
    expect(mockTasksRequest).toHaveBeenCalledWith("user-b", "/api/projects/available");
  });
});

// ─── GET /projects/:projectId/tasks ─────────────────────────────────────────

describe("GET /projects/:projectId/tasks — list tasks for a project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
    mockTasksRequest.mockResolvedValue(OK_RESULT);
  });

  it("calls agentTasksRequest with userId and encoded project path (Guards G + H)", async () => {
    await makeRequest("/projects/proj-123/tasks");

    expect(mockTasksRequest).toHaveBeenCalledWith(
      "user-a",
      "/api/projects/proj-123/tasks",
    );
  });

  it("URL-encodes special characters in projectId", async () => {
    await makeRequest("/projects/my%20project/tasks");

    // Hono decodes %20 to a space in the path param; encodeURIComponent must
    // re-encode it for the upstream path. Asserting the EXACT encoded path
    // kills the mutation (dropping encodeURIComponent yields a raw space).
    expect(mockTasksRequest).toHaveBeenCalledWith(
      "user-a",
      "/api/projects/my%20project/tasks",
    );
  });
});

// ─── POST /projects — create project (Guard G + H: body + method) ────────────

describe("POST /projects — create a project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
    mockTasksRequest.mockResolvedValue({ ok: true, data: { id: "new-proj" } });
  });

  const validBody = {
    name: "My Project",
    slug: "my-project",
    teamId: "00000000-0000-0000-0000-000000000001",
  };

  it("calls agentTasksRequest with POST method, correct path, and serialized body (Guard H)", async () => {
    await makeRequest("/projects", "POST", validBody);

    expect(mockTasksRequest).toHaveBeenCalledWith(
      "user-a",
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );
  });

  it("passes userId to agentTasksRequest (Guard G)", async () => {
    await makeRequest("/projects", "POST", validBody);

    const [calledUserId] = mockTasksRequest.mock.calls[0]!;
    // GUARD G — mutation: use wrong userId → calledUserId !== "user-a" → fails
    expect(calledUserId).toBe("user-a");
  });

  it("returns 201 on success", async () => {
    const res = await makeRequest("/projects", "POST", validBody);
    expect(res.status).toBe(201);
  });

  it("validates slug format → 400 on invalid slug, agentTasksRequest not called", async () => {
    const res = await makeRequest("/projects", "POST", {
      ...validBody,
      slug: "MY INVALID SLUG",
    });
    expect(res.status).toBe(400);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });

  it("rejects missing required name → 400", async () => {
    const res = await makeRequest("/projects", "POST", {
      slug: "my-proj",
      teamId: "00000000-0000-0000-0000-000000000001",
    });
    expect(res.status).toBe(400);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });
});

// ─── POST /projects/:projectId/tasks — create task ──────────────────────────

describe("POST /projects/:projectId/tasks — create a task in a project", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
    mockTasksRequest.mockResolvedValue({ ok: true, data: { id: "new-task" } });
  });

  const validBody = { title: "Fix the bug", priority: "HIGH" as const };

  it("calls agentTasksRequest with POST, correct project path, and body (Guard H)", async () => {
    await makeRequest("/projects/proj-42/tasks", "POST", validBody);

    expect(mockTasksRequest).toHaveBeenCalledWith(
      "user-a",
      "/api/projects/proj-42/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(validBody),
      }),
    );
  });

  it("passes caller userId to agentTasksRequest (Guard G)", async () => {
    await makeRequest("/projects/proj-42/tasks", "POST", validBody);

    expect(mockTasksRequest.mock.calls[0]![0]).toBe("user-a");
  });

  it("rejects empty title → 400, agentTasksRequest not called", async () => {
    const res = await makeRequest("/projects/proj-42/tasks", "POST", {
      title: "",
    });
    expect(res.status).toBe(400);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });

  it("rejects invalid priority enum → 400", async () => {
    const res = await makeRequest("/projects/proj-42/tasks", "POST", {
      title: "Valid title",
      priority: "ULTRA",
    });
    expect(res.status).toBe(400);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });
});

// ─── POST /:taskId/comments — add a comment ─────────────────────────────────

describe("POST /:taskId/comments — add comment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
    mockTasksRequest.mockResolvedValue({ ok: true, data: { id: "comment-1" } });
  });

  it("calls agentTasksRequest with POST, correct path, and comment body (Guard H)", async () => {
    await makeRequest("/task-abc/comments", "POST", {
      content: "This is my comment",
    });

    expect(mockTasksRequest).toHaveBeenCalledWith(
      "user-a",
      "/api/tasks/task-abc/comments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "This is my comment" }),
      }),
    );
  });

  it("passes caller userId (Guard G)", async () => {
    await makeRequest("/task-abc/comments", "POST", { content: "hello" });
    expect(mockTasksRequest.mock.calls[0]![0]).toBe("user-a");
  });

  it("rejects empty content → 400", async () => {
    const res = await makeRequest("/task-abc/comments", "POST", { content: "" });
    expect(res.status).toBe(400);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });

  it("rejects content over 5000 chars → 400", async () => {
    const res = await makeRequest("/task-abc/comments", "POST", {
      content: "x".repeat(5001),
    });
    expect(res.status).toBe(400);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });
});

// ─── POST /teams/:teamId/sync — GitHub sync ──────────────────────────────────

describe("POST /teams/:teamId/sync — sync GitHub repos into team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-a");
      await next();
    });
    mockTasksRequest.mockResolvedValue({
      ok: true,
      data: { synced: 5, created: 2 },
    });
  });

  it("calls agentTasksRequest with POST and correct team path (Guards G + H)", async () => {
    await makeRequest("/teams/team-xyz/sync", "POST");

    expect(mockTasksRequest).toHaveBeenCalledWith(
      "user-a",
      "/api/teams/team-xyz/sync",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("passes caller userId (Guard G)", async () => {
    await makeRequest("/teams/team-xyz/sync", "POST");
    expect(mockTasksRequest.mock.calls[0]![0]).toBe("user-a");
  });

  it("uses extended timeout for sync operations (timeoutMs present in options)", async () => {
    await makeRequest("/teams/team-xyz/sync", "POST");

    const options = mockTasksRequest.mock.calls[0]![2] as { timeoutMs?: number };
    // Sync is slow (iterates all repos) — must use a generous timeout
    expect(options?.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it("proxies sync result to caller → 200", async () => {
    const res = await makeRequest("/teams/team-xyz/sync", "POST");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { synced: number; created: number };
    expect(body.synced).toBe(5);
  });

  it("unauthenticated → 401 (Guard F)", async () => {
    mockRequireAuth.mockImplementationOnce(async (c: any) =>
      c.json({ error: "unauthorized" }, 401),
    );

    const res = await makeRequest("/teams/team-xyz/sync", "POST");
    expect(res.status).toBe(401);
    expect(mockTasksRequest).not.toHaveBeenCalled();
  });
});
