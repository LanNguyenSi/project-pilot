import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock calls are hoisted before imports by Vitest.

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

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set?.("userId", "user-1");
    await next();
  }),
}));

import { getCredential } from "../src/services/credentials.js";
import {
  extractPreviewTasks,
  saveForgeTaskSnapshot,
  linkForgeSnapshotToRepo,
} from "../src/services/forge-task-snapshot.js";
import { migrateForgeTasks } from "../src/services/forge-task-migration.js";
import { requireAuth } from "../src/middleware/auth.js";
import { forge } from "../src/routes/forge.js";

const mockGetCredential = vi.mocked(getCredential);
const mockExtractPreviewTasks = vi.mocked(extractPreviewTasks);
const mockSaveForgeTaskSnapshot = vi.mocked(saveForgeTaskSnapshot);
const mockLinkForgeSnapshotToRepo = vi.mocked(linkForgeSnapshotToRepo);
const mockMigrateForgeTasks = vi.mocked(migrateForgeTasks);
const mockRequireAuth = vi.mocked(requireAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  return forge.request(path, init);
}

function postJson(path: string, body: unknown): Promise<Response> {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_SESSION_ID = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("forge routes", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockRequireAuth.mockImplementation(async (c: any, next: any) => {
      c.set?.("userId", "user-1");
      await next();
    });
    mockGetCredential.mockResolvedValue("forge-api-key-abc");
    mockExtractPreviewTasks.mockReturnValue([]);
    mockSaveForgeTaskSnapshot.mockResolvedValue(undefined);
    mockLinkForgeSnapshotToRepo.mockResolvedValue(undefined);
    // vi.clearAllMocks() clears call history but NOT implementations, so
    // without an explicit reset here a future /migrate-tasks test could
    // silently inherit a stale mockResolvedValue from a prior test.
    mockMigrateForgeTasks.mockReset();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // ==========================================================================
  // requireAuth wiring (AC 8)
  // ==========================================================================

  describe("auth gate", () => {
    it("returns 401 and never reaches fetch when requireAuth rejects", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      mockRequireAuth.mockImplementationOnce(async (c: any) =>
        c.json({ error: "unauthorized" }, 401),
      );

      const res = await call("/projects");

      expect(res.status).toBe(401);
      expect(mockGetCredential).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // GET /projects
  // ==========================================================================

  describe("GET /projects", () => {
    it("returns forge data on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(200, { projects: [{ id: "p1" }], total: 1 })),
      );

      const res = await call("/projects");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ projects: [{ id: "p1" }], total: 1 });
    });

    it("returns 400 when credential is not configured (no fetch call)", async () => {
      mockGetCredential.mockResolvedValue(null);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await call("/projects");
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Project Forge not configured. Add your API key in Settings.");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // DELETE /projects/:id
  // ==========================================================================

  describe("DELETE /projects/:id", () => {
    it("deletes the project and encodes the id in the query string", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string, init?: RequestInit) => {
          capturedUrl = url;
          capturedMethod = init?.method;
          return Promise.resolve(jsonResponse(200, { ok: true }));
        }),
      );

      const res = await call("/projects/proj%201", { method: "DELETE" });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(capturedMethod).toBe("DELETE");
      expect(capturedUrl).toBe("https://forge.test/api/v1/projects?id=proj%201");
    });

    it("passes through the error when the credential is missing", async () => {
      mockGetCredential.mockResolvedValue(null);
      const res = await call("/projects/proj-1", { method: "DELETE" });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Project Forge not configured. Add your API key in Settings.");
    });
  });

  // ==========================================================================
  // GET /preview
  // ==========================================================================

  describe("GET /preview", () => {
    it("returns 400 when sessionId is missing", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await call("/preview");
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing or invalid sessionId");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 400 when sessionId is not a valid UUID", async () => {
      const res = await call("/preview?sessionId=not-a-uuid");
      expect(res.status).toBe(400);
    });

    it("returns preview data for a valid sessionId", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(200, { sessionId: VALID_SESSION_ID, preview: { tasks: [] } }),
        ),
      );

      const res = await call(`/preview?sessionId=${VALID_SESSION_ID}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ sessionId: VALID_SESSION_ID, preview: { tasks: [] } });
    });

    it("passes through the error when forgeRequest fails (network error)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      const res = await call(`/preview?sessionId=${VALID_SESSION_ID}`);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Project Forge unreachable");
    });
  });

  // ==========================================================================
  // POST /generate — forgeRequest branch matrix (AC 1, 2, 6)
  // ==========================================================================

  describe("POST /generate", () => {
    const validBody = { projectName: "my-app", summary: "A cool app" };

    it("happy path: returns forge data, forwards X-API-Key + body, and snapshots preview tasks", async () => {
      let capturedUrl: string | undefined;
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: Record<string, unknown> | undefined;
      let capturedSignal: unknown;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string, init?: RequestInit) => {
          capturedUrl = url;
          capturedHeaders = init?.headers as Record<string, string>;
          capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
          capturedSignal = init?.signal;
          return Promise.resolve(
            jsonResponse(200, { sessionId: "sess-1", preview: { tasks: [{ id: "t1", title: "Task" }] } }),
          );
        }),
      );
      mockExtractPreviewTasks.mockReturnValue([{ id: "t1", title: "Task" }]);

      const res = await postJson("/generate", validBody);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ sessionId: "sess-1", preview: { tasks: [{ id: "t1", title: "Task" }] } });

      expect(capturedUrl).toBe("https://forge.test/api/v1/generate");
      expect(capturedHeaders?.["X-API-Key"]).toBe("forge-api-key-abc");
      expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
      expect(capturedBody).toMatchObject(validBody);
      expect(capturedSignal).toBeInstanceOf(AbortSignal);

      expect(mockExtractPreviewTasks).toHaveBeenCalledWith({ tasks: [{ id: "t1", title: "Task" }] });
      expect(mockSaveForgeTaskSnapshot).toHaveBeenCalledWith("user-1", "sess-1", [{ id: "t1", title: "Task" }]);
    });

    it("tolerates saveForgeTaskSnapshot rejecting: still returns 200 with the forge data", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(200, { sessionId: "sess-2", preview: { tasks: [] } })),
      );
      mockSaveForgeTaskSnapshot.mockRejectedValue(new Error("db down"));

      const res = await postJson("/generate", validBody);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ sessionId: "sess-2", preview: { tasks: [] } });
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("returns 400 when Project Forge credential is missing", async () => {
      mockGetCredential.mockResolvedValue(null);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const res = await postJson("/generate", validBody);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Project Forge not configured. Add your API key in Settings.");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockSaveForgeTaskSnapshot).not.toHaveBeenCalled();
    });

    it("passes through the upstream error message on a non-ok status", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(500, { error: "Upstream boom" })),
      );

      const res = await postJson("/generate", validBody);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Upstream boom");
    });

    it("falls back to a generic error message when the upstream body has no error field", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(503, {})));

      const res = await postJson("/generate", validBody);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Forge API error: 503");
    });

    it("treats body.ok === false as an error even when the HTTP status is 200", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(200, { ok: false, error: "forge-specific failure" })),
      );

      const res = await postJson("/generate", validBody);
      // forgeRequest propagates res.status (200) even on a logical failure.
      expect(res.status).toBe(200);
      const body = await res.json();
      // Pin the EXACT shape: the route's error path returns ONLY `{ error }`.
      // A mutant that drops the `body.ok === false` check would instead
      // passthrough the raw upstream body (`{ ok: false, error }`), which
      // would fail this exact-shape assertion while still carrying `.error`.
      expect(body).toEqual({ error: "forge-specific failure" });
      expect((body as { ok?: unknown }).ok).toBeUndefined();
    });

    it("returns 502 when fetch rejects with a generic network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      const res = await postJson("/generate", validBody);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Project Forge unreachable");
    });

    it("returns 504 when fetch aborts with a timeout", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      );

      const res = await postJson("/generate", validBody);
      expect(res.status).toBe(504);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Generation timed out. Please try again.");
    });

    it("returns 504 when AbortSignal.timeout() rejects with a TimeoutError DOMException", async () => {
      vi.stubGlobal(
        "fetch",
        // Real Node 26 message for an AbortSignal.timeout() rejection.
        vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
      );

      const res = await postJson("/generate", validBody);
      expect(res.status).toBe(504);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Generation timed out. Please try again.");
    });

    it("warns with the raw thrown value when the snapshot rejection is not an Error instance", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(200, { sessionId: "sess-3", preview: { tasks: [] } })),
      );
      mockSaveForgeTaskSnapshot.mockRejectedValue("boom-string-rejection");

      const res = await postJson("/generate", validBody);

      expect(res.status).toBe(200);
      const allWarnCalls = consoleWarnSpy.mock.calls.flat().join(" ");
      expect(allWarnCalls).toContain("boom-string-rejection");
    });
  });

  // ==========================================================================
  // POST /publish (AC 3, 4)
  // ==========================================================================

  describe("POST /publish", () => {
    const validBody = { sessionId: VALID_SESSION_ID };

    it("happy path: returns forge data and links the snapshot to the published repo", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(200, {
            result: { repoUrl: "https://github.com/lan/my-app", cloneUrl: "git@github.com:lan/my-app.git", projectName: "my-app" },
          }),
        ),
      );

      const res = await postJson("/publish", validBody);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        result: { repoUrl: "https://github.com/lan/my-app", cloneUrl: "git@github.com:lan/my-app.git", projectName: "my-app" },
      });
      expect(mockLinkForgeSnapshotToRepo).toHaveBeenCalledWith("user-1", VALID_SESSION_ID, "https://github.com/lan/my-app");
    });

    it("tolerates linkForgeSnapshotToRepo rejecting: still returns the forge data", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(200, { result: { repoUrl: "https://github.com/lan/my-app", cloneUrl: "x", projectName: "my-app" } }),
        ),
      );
      mockLinkForgeSnapshotToRepo.mockRejectedValue(new Error("db down"));

      const res = await postJson("/publish", validBody);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        result: { repoUrl: "https://github.com/lan/my-app", cloneUrl: "x", projectName: "my-app" },
      });
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("passes through the error when the credential is missing", async () => {
      mockGetCredential.mockResolvedValue(null);
      const res = await postJson("/publish", validBody);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Project Forge not configured. Add your API key in Settings.");
      expect(mockLinkForgeSnapshotToRepo).not.toHaveBeenCalled();
    });

    it("warns with the raw thrown value when the link rejection is not an Error instance", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          jsonResponse(200, { result: { repoUrl: "https://github.com/lan/my-app", cloneUrl: "x", projectName: "my-app" } }),
        ),
      );
      mockLinkForgeSnapshotToRepo.mockRejectedValue("boom-string-rejection");

      const res = await postJson("/publish", validBody);

      expect(res.status).toBe(200);
      const allWarnCalls = consoleWarnSpy.mock.calls.flat().join(" ");
      expect(allWarnCalls).toContain("boom-string-rejection");
    });
  });

  // ==========================================================================
  // POST /migrate-tasks
  // ==========================================================================

  describe("POST /migrate-tasks", () => {
    it("returns the migration result on success", async () => {
      mockMigrateForgeTasks.mockResolvedValue({
        ok: true,
        result: { projectId: "proj-x", projectCreated: false, taskCount: 2, created: 2, skipped: 0, failed: 0 },
      });

      const res = await postJson("/migrate-tasks", { repoUrl: "https://github.com/lan/my-app" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ projectId: "proj-x", projectCreated: false, taskCount: 2, created: 2, skipped: 0, failed: 0 });
      expect(mockMigrateForgeTasks).toHaveBeenCalledWith("user-1", "https://github.com/lan/my-app", undefined);
    });

    it("returns {error, code, teams} with the outcome's status on failure", async () => {
      mockMigrateForgeTasks.mockResolvedValue({
        ok: false,
        status: 400,
        error: "Selected team not found",
        code: "multiple_teams",
        teams: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      });

      const res = await postJson("/migrate-tasks", { repoUrl: "https://github.com/lan/my-app", teamId: "11111111-1111-1111-1111-111111111111" });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; code: string; teams: unknown[] };
      expect(body.error).toBe("Selected team not found");
      expect(body.code).toBe("multiple_teams");
      expect(body.teams).toEqual([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
    });

    // LOW finding 3: too_many_dependencies passes both `code` and `taskId`
    // through to the response body unchanged.
    it("passes through code and taskId on a too_many_dependencies outcome", async () => {
      mockMigrateForgeTasks.mockResolvedValue({
        ok: false,
        status: 400,
        code: "too_many_dependencies",
        error: 'Task "big" has 51 dependsOn entries (max 50)',
        taskId: "big",
      });

      const res = await postJson("/migrate-tasks", { repoUrl: "https://github.com/lan/my-app" });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; code: string; taskId: string };
      expect(body.code).toBe("too_many_dependencies");
      expect(body.taskId).toBe("big");
    });

    // LOW finding 3: cyclic_dependencies passes both `code` and `cycle`
    // through to the response body unchanged.
    it("passes through code and cycle on a cyclic_dependencies outcome", async () => {
      mockMigrateForgeTasks.mockResolvedValue({
        ok: false,
        status: 409,
        code: "cyclic_dependencies",
        error: "Dependency cycle detected among planforge tasks: a -> b -> a",
        cycle: ["a", "b", "a"],
      });

      const res = await postJson("/migrate-tasks", { repoUrl: "https://github.com/lan/my-app" });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string; code: string; cycle: string[] };
      expect(body.code).toBe("cyclic_dependencies");
      expect(body.cycle).toEqual(["a", "b", "a"]);
    });
  });

  // ==========================================================================
  // GET /ai-assist/capabilities
  // ==========================================================================

  describe("GET /ai-assist/capabilities", () => {
    it("returns the enabled shape on success (no X-API-Key header sent)", async () => {
      let capturedHeaders: Record<string, string> | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          capturedHeaders = init?.headers as Record<string, string>;
          return Promise.resolve(
            jsonResponse(200, {
              enabled: true,
              provider: "groq",
              model: "llama3-8b-8192",
              features: { magicFill: true, intakeEnrichment: true, postScaffoldReview: false },
            }),
          );
        }),
      );

      const res = await call("/ai-assist/capabilities");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        enabled: true,
        provider: "groq",
        model: "llama3-8b-8192",
        features: { magicFill: true, intakeEnrichment: true, postScaffoldReview: false },
      });
      expect(capturedHeaders?.["X-API-Key"]).toBeUndefined();
      // capabilities never touches credentials — the whole point of forgeAiRequest.
      expect(mockGetCredential).not.toHaveBeenCalled();
    });

    it("degrades gracefully to disabled (still 200) when forge is unreachable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      const res = await call("/ai-assist/capabilities");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ enabled: false, provider: null, model: null, features: { magicFill: false } });
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // POST /ai-assist/magic-fill — forgeAiRequest branch matrix (AC 5, 7)
  // ==========================================================================

  describe("POST /ai-assist/magic-fill", () => {
    const validBody = { prompt: "Build a todo app" };

    it("happy path: returns AI-filled data without an X-API-Key header, 30s timeout", async () => {
      let capturedHeaders: Record<string, string> | undefined;
      let capturedSignal: unknown;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          capturedHeaders = init?.headers as Record<string, string>;
          capturedSignal = init?.signal;
          return Promise.resolve(
            jsonResponse(200, {
              ok: true,
              data: { projectName: "todo-app", summary: "A todo app", features: ["Add tasks"] },
              provider: "groq",
              model: "llama3-8b-8192",
            }),
          );
        }),
      );

      const res = await postJson("/ai-assist/magic-fill", validBody);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        ok: true,
        data: { projectName: "todo-app", summary: "A todo app", features: ["Add tasks"] },
        provider: "groq",
        model: "llama3-8b-8192",
      });
      expect(capturedHeaders?.["X-API-Key"]).toBeUndefined();
      expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(mockGetCredential).not.toHaveBeenCalled();
    });

    it("treats body.ok === false as an error even when the HTTP status is 200", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(200, { ok: false, error: "ai failure" })),
      );

      const res = await postJson("/ai-assist/magic-fill", validBody);
      expect(res.status).toBe(200);
      const body = await res.json();
      // Pin the EXACT shape: the route's error path returns ONLY `{ error }`.
      // A mutant that drops the `(body as any).ok === false` check would
      // instead passthrough the raw upstream body (`{ ok: false, error }`),
      // which would fail this exact-shape assertion while still carrying
      // `.error`.
      expect(body).toEqual({ error: "ai failure" });
      expect((body as { ok?: unknown }).ok).toBeUndefined();
    });

    it("falls back to a generic error message when the upstream body has no error field", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));

      const res = await postJson("/ai-assist/magic-fill", validBody);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Forge AI error: 500");
    });

    it("returns 502 when fetch rejects with a generic network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      const res = await postJson("/ai-assist/magic-fill", validBody);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Project Forge unreachable");
    });

    it("returns 504 when fetch aborts with a timeout", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      );

      const res = await postJson("/ai-assist/magic-fill", validBody);
      expect(res.status).toBe(504);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("AI request timed out. Please try again.");
    });

    it("returns 504 when AbortSignal.timeout() rejects with a TimeoutError DOMException", async () => {
      vi.stubGlobal(
        "fetch",
        // Real Node 26 message for an AbortSignal.timeout() rejection.
        vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
      );

      const res = await postJson("/ai-assist/magic-fill", validBody);
      expect(res.status).toBe(504);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("AI request timed out. Please try again.");
    });
  });
});
