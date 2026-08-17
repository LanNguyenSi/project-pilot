import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/index.js", () => ({
  config: { AGENT_TASKS_URL: "https://agent-tasks.test" },
}));

vi.mock("../src/services/credentials.js", () => ({
  getCredential: vi.fn().mockResolvedValue("tasks-token"),
}));

vi.mock("../src/services/forge-task-snapshot.js", () => ({
  getForgeSnapshotByRepo: vi.fn(),
  deleteForgeSnapshotByRepo: vi.fn().mockResolvedValue(undefined),
}));

import {
  migrateForgeTasks,
  parseOwnerRepo,
  topoSortForgeTasks,
  CycleError,
} from "../src/services/forge-task-migration.js";
import type { ForgePreviewTask } from "../src/services/forge-task-snapshot.js";
import {
  getForgeSnapshotByRepo,
  deleteForgeSnapshotByRepo,
} from "../src/services/forge-task-snapshot.js";

const getSnapshot = vi.mocked(getForgeSnapshotByRepo);
const deleteSnapshot = vi.mocked(deleteForgeSnapshotByRepo);

const REPO_URL = "https://github.com/lan/my-app";
const OWNER_REPO = "lan/my-app";

interface MockRoutes {
  available?: { status: number; body: unknown };
  // Response for the team-scoped re-query (`/projects/available?teamId=...`),
  // used when the first unscoped call 400s for a multi-team human.
  availableScoped?: { status: number; body: unknown };
  teams?: { status: number; body: unknown };
  createProject?: { status: number; body: unknown };
  import?: { status: number; body: unknown };
  // When set, every import batch returns the next entry in turn (for
  // multi-batch assertions); falls back to `import` once exhausted.
  importSequence?: { status: number; body: unknown }[];
  // v2 dependency-aware path: single-task create (`POST .../tasks`), one
  // entry consumed per call in order; falls back to a fresh `created-N` id
  // once exhausted.
  createTaskSequence?: { status: number; body: unknown }[];
  // v2 idempotent re-run: `GET .../tasks?externalRef=X` lookup, keyed by X.
  lookupByExternalRef?: Record<string, { status: number; body: unknown }>;
}

// Records the JSON bodies POSTed per route so tests can assert the mapped payload.
const captured: { createProject: unknown[]; import: unknown[]; createTask: unknown[] } = {
  createProject: [],
  import: [],
  createTask: [],
};

function mockFetch(routes: MockRoutes) {
  captured.createProject = [];
  captured.import = [];
  captured.createTask = [];
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    if (url.includes("/api/projects/available")) {
      const scoped = url.includes("teamId=");
      const r =
        (scoped ? routes.availableScoped : routes.available) ?? { status: 200, body: { projects: [] } };
      return json(r.status, r.body);
    }
    if (url.includes("/api/teams")) {
      const r = routes.teams ?? { status: 200, body: { teams: [] } };
      return json(r.status, r.body);
    }
    if (url.includes("/tasks/import")) {
      captured.import.push(body);
      const seq = routes.importSequence;
      const r = (seq && seq[captured.import.length - 1]) ??
        routes.import ?? { status: 201, body: { created: 0, skipped: 0, failed: 0 } };
      return json(r.status, r.body);
    }
    if (method === "GET" && /\/tasks\?externalRef=/.test(url)) {
      const match = url.match(/externalRef=([^&]+)/);
      const externalRef = match ? decodeURIComponent(match[1]) : "";
      const r = routes.lookupByExternalRef?.[externalRef] ?? { status: 200, body: { tasks: [] } };
      return json(r.status, r.body);
    }
    if (method === "POST" && /\/api\/projects\/[^/]+\/tasks$/.test(url)) {
      captured.createTask.push(body);
      const seq = routes.createTaskSequence;
      const r = (seq && seq[captured.createTask.length - 1]) ??
        { status: 201, body: { task: { id: `created-${captured.createTask.length}` } } };
      return json(r.status, r.body);
    }
    if (url.includes("/api/projects") && method === "POST") {
      captured.createProject.push(body);
      const r = routes.createProject ?? { status: 201, body: { project: { id: "new-proj" } } };
      return json(r.status, r.body);
    }
    throw new Error(`unmatched URL: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("parseOwnerRepo", () => {
  it.each([
    ["https://github.com/lan/my-app", "lan/my-app"],
    ["https://github.com/lan/my-app.git", "lan/my-app"],
    ["https://github.com/lan/my-app/", "lan/my-app"],
    ["git@github.com:lan/my-app.git", "lan/my-app"],
  ])("parses %s -> %s", (input, expected) => {
    expect(parseOwnerRepo(input)).toBe(expected);
  });

  it("returns null for a non-github URL", () => {
    expect(parseOwnerRepo("https://example.com/foo")).toBeNull();
  });
});

describe("topoSortForgeTasks", () => {
  function task(id: string, dependsOn?: string[]): ForgePreviewTask {
    return { id, title: `Task ${id}`, ...(dependsOn ? { dependsOn } : {}) };
  }

  it("orders a diamond graph so every dependency precedes its dependents", () => {
    // t1 -> (t2, t3) -> t4
    const tasks = [task("t1"), task("t2", ["t1"]), task("t3", ["t1"]), task("t4", ["t2", "t3"])];

    const result = topoSortForgeTasks(tasks);

    expect(result.order).toEqual(["t1", "t2", "t3", "t4"]);
    expect(result.warnings).toEqual([]);
    expect(result.dependsOnById.get("t4")).toEqual(["t2", "t3"]);
  });

  it("keeps independent chains (waves) in their own relative order, interleaved by array position", () => {
    // Wave A: a1 -> a2; Wave B: b1 -> b2; no cross-wave edges.
    const tasks = [task("a1"), task("b1"), task("a2", ["a1"]), task("b2", ["b1"])];

    const result = topoSortForgeTasks(tasks);

    // Both a1 and b1 are ready first (array order); each dependent becomes
    // ready right after its own blocker, so array order is preserved exactly.
    expect(result.order).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("detects a direct cycle and reports it, isolated from unrelated acyclic tasks", () => {
    // a <-> b cycle; c -> d is a normal, unrelated acyclic edge.
    const tasks = [task("a", ["b"]), task("b", ["a"]), task("d"), task("c", ["d"])];

    expect(() => topoSortForgeTasks(tasks)).toThrow(CycleError);
    try {
      topoSortForgeTasks(tasks);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CycleError);
      expect((err as CycleError).cycle).toEqual(["a", "b", "a"]);
    }
  });

  it("ignores an edge to an already-resolved task while chasing the real cycle", () => {
    // f depends on e (resolvable) AND a (stuck in the a<->b cycle). f must
    // precede a/b in the array so findCycle visits f's traversal first and
    // walks past the resolved "e" edge on its way to the cycle.
    const tasks = [task("f", ["e", "a"]), task("e"), task("a", ["b"]), task("b", ["a"])];

    try {
      topoSortForgeTasks(tasks);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CycleError);
      // The reported cycle is exactly a<->b — f (and its resolved "e" edge)
      // is not part of it, even though f is also unorderable as a result.
      expect((err as CycleError).cycle).toEqual(["a", "b", "a"]);
    }
  });

  it("drops a dependsOn edge pointing at a planforge id missing from the snapshot, with a warning", () => {
    const tasks = [task("t1", ["ghost"])];

    const result = topoSortForgeTasks(tasks);

    expect(result.order).toEqual(["t1"]);
    expect(result.dependsOnById.get("t1")).toEqual([]);
    expect(result.warnings).toEqual(['Task "t1" depends on unknown planforge id "ghost" (dropped)']);
  });
});

describe("migrateForgeTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    getSnapshot.mockReset();
    deleteSnapshot.mockResolvedValue(undefined);
  });

  it("returns no_snapshot when nothing was captured for the repo", async () => {
    getSnapshot.mockResolvedValue(null);
    mockFetch({});

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("no_snapshot");
  });

  it("returns invalid_repo for an unparseable URL (before touching the snapshot)", async () => {
    const outcome = await migrateForgeTasks("u1", "https://example.com/not-a-repo");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("invalid_repo");
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it("imports into an existing linked project without creating one", async () => {
    getSnapshot.mockResolvedValue([
      { id: "t1", title: "Set up CI", wave: "Wave 1", priority: "high", summary: "Add GitHub Actions" },
      { id: "t2", title: "Write docs" },
    ]);
    mockFetch({
      available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
      import: { status: 201, body: { created: 2, skipped: 0, failed: 0 } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.projectId).toBe("proj-x");
      expect(outcome.result.projectCreated).toBe(false);
      expect(outcome.result.created).toBe(2);
    }
    expect(captured.createProject).toHaveLength(0);
    // Mapping: planforge id -> externalRef, source + wave labels, mapped priority.
    const sent = (captured.import[0] as { tasks: any[] }).tasks;
    expect(sent[0]).toMatchObject({
      title: "Set up CI",
      description: "Add GitHub Actions",
      externalRef: "t1",
      priority: "HIGH",
      labels: ["source:forge", "wave:Wave 1"],
    });
    // Unknown/missing priority falls back to MEDIUM; no description key when absent.
    expect(sent[1].priority).toBe("MEDIUM");
    expect(sent[1].labels).toEqual(["source:forge"]);
    expect(sent[1]).not.toHaveProperty("description");
    expect(deleteSnapshot).toHaveBeenCalledWith("u1", REPO_URL);
  });

  it("creates the project when none is linked and the user has exactly one team", async () => {
    getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
    mockFetch({
      available: { status: 200, body: { projects: [] } },
      teams: { status: 200, body: { teams: [{ id: "team-1", name: "Solo" }] } },
      createProject: { status: 201, body: { project: { id: "fresh-proj" } } },
      import: { status: 201, body: { created: 1, skipped: 0, failed: 0 } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.projectCreated).toBe(true);
      expect(outcome.result.projectId).toBe("fresh-proj");
    }
    expect(captured.createProject[0]).toMatchObject({
      teamId: "team-1",
      githubRepo: OWNER_REPO,
      slug: "my-app",
      name: "my-app",
    });
  });

  it("returns multiple_teams with the team list when the user has >1 team", async () => {
    getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
    mockFetch({
      available: { status: 200, body: { projects: [] } },
      teams: { status: 200, body: { teams: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("multiple_teams");
      expect(outcome.teams).toHaveLength(2);
    }
    expect(captured.createProject).toHaveLength(0);
  });

  it("creates in the chosen team when an explicit teamId is supplied", async () => {
    getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
    mockFetch({
      available: { status: 200, body: { projects: [] } },
      teams: { status: 200, body: { teams: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } },
      createProject: { status: 201, body: { project: { id: "fresh-proj" } } },
      import: { status: 201, body: { created: 1, skipped: 0, failed: 0 } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL, "b");

    expect(outcome.ok).toBe(true);
    expect((captured.createProject[0] as { teamId: string }).teamId).toBe("b");
  });

  it("keeps the snapshot when an import batch reports failures", async () => {
    getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
    mockFetch({
      available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
      import: { status: 422, body: { created: 0, skipped: 0, failed: 1, errors: [{ index: 0, error: "bad" }] } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    // import endpoint returns 422 -> agentTasksRequest treats it as an error.
    expect(outcome.ok).toBe(false);
    expect(deleteSnapshot).not.toHaveBeenCalled();
  });

  it("reports partial success (201 with failed>0) and keeps the snapshot", async () => {
    getSnapshot.mockResolvedValue([
      { id: "t1", title: "ok" },
      { id: "t2", title: "bad" },
    ]);
    mockFetch({
      available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
      import: { status: 201, body: { created: 1, skipped: 0, failed: 1, errors: [{ index: 1, error: "boom" }] } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.created).toBe(1);
      expect(outcome.result.failed).toBe(1);
    }
    // failed>0 -> snapshot retained so the user can re-run.
    expect(deleteSnapshot).not.toHaveBeenCalled();
  });

  it("matches an existing project's githubRepo case-insensitively", async () => {
    getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
    mockFetch({
      available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: "Lan/My-App", teamId: "team-1" }] } },
      import: { status: 201, body: { created: 1, skipped: 0, failed: 0 } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.projectId).toBe("proj-x");
    expect(captured.createProject).toHaveLength(0);
  });

  it("sends no import batch and deletes the snapshot for an empty task list", async () => {
    getSnapshot.mockResolvedValue([]);
    mockFetch({
      available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.taskCount).toBe(0);
      expect(outcome.result.created).toBe(0);
    }
    expect(captured.import).toHaveLength(0);
    expect(deleteSnapshot).toHaveBeenCalledWith("u1", REPO_URL);
  });

  it("splits >200 tasks into multiple import batches and sums the counts", async () => {
    const tasks = Array.from({ length: 201 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}` }));
    getSnapshot.mockResolvedValue(tasks);
    mockFetch({
      available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
      importSequence: [
        { status: 201, body: { created: 200, skipped: 0, failed: 0 } },
        { status: 201, body: { created: 1, skipped: 0, failed: 0 } },
      ],
    });

    const outcome = await migrateForgeTasks("u1", REPO_URL);

    expect(captured.import).toHaveLength(2);
    expect((captured.import[0] as { tasks: unknown[] }).tasks).toHaveLength(200);
    expect((captured.import[1] as { tasks: unknown[] }).tasks).toHaveLength(1);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.created).toBe(201);
  });

  describe("multi-team human (unscoped /available 400s)", () => {
    it("resolves the single team, re-queries scoped, and creates the project", async () => {
      getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
      mockFetch({
        available: { status: 400, body: { error: "multiple_teams", teamIds: ["team-1"] } },
        teams: { status: 200, body: { teams: [{ id: "team-1", name: "Solo" }] } },
        availableScoped: { status: 200, body: { projects: [] } },
        createProject: { status: 201, body: { project: { id: "fresh-proj" } } },
        import: { status: 201, body: { created: 1, skipped: 0, failed: 0 } },
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.result.projectId).toBe("fresh-proj");
      expect((captured.createProject[0] as { teamId: string }).teamId).toBe("team-1");
    });

    it("returns the multiple_teams picker when the user has >1 team and gave no teamId", async () => {
      getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
      mockFetch({
        available: { status: 400, body: { error: "multiple_teams", teamIds: ["a", "b"] } },
        teams: { status: 200, body: { teams: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } },
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe("multiple_teams");
        expect(outcome.teams).toHaveLength(2);
      }
    });

    it("uses the explicit teamId to scope the re-query and create", async () => {
      getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one" }]);
      mockFetch({
        available: { status: 400, body: { error: "multiple_teams", teamIds: ["a", "b"] } },
        teams: { status: 200, body: { teams: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } },
        availableScoped: { status: 200, body: { projects: [] } },
        createProject: { status: 201, body: { project: { id: "fresh-proj" } } },
        import: { status: 201, body: { created: 1, skipped: 0, failed: 0 } },
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL, "b");

      expect(outcome.ok).toBe(true);
      expect((captured.createProject[0] as { teamId: string }).teamId).toBe("b");
    });
  });

  describe("BC pin: no task carries dependsOn", () => {
    it("uses the v1 batch-import route and never calls the single-task create route", async () => {
      getSnapshot.mockResolvedValue([
        { id: "t1", title: "Task one" },
        { id: "t2", title: "Task two", wave: "Wave 1" },
      ]);
      mockFetch({
        available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
        import: { status: 201, body: { created: 2, skipped: 0, failed: 0 } },
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.result.created).toBe(2);
      expect(captured.import).toHaveLength(1);
      expect(captured.createTask).toHaveLength(0);
    });
  });

  describe("v2 dependency-aware import (D-003)", () => {
    it("creates tasks in topological order, wiring dependsOn to previously-created uuids", async () => {
      getSnapshot.mockResolvedValue([
        { id: "t1", title: "Set up CI" },
        { id: "t2", title: "Write API", dependsOn: ["t1"] },
        { id: "t3", title: "Write tests", dependsOn: ["t1", "t2"] },
      ]);
      mockFetch({
        available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
        createTaskSequence: [
          { status: 201, body: { task: { id: "uuid-1" } } },
          { status: 201, body: { task: { id: "uuid-2" } } },
          { status: 201, body: { task: { id: "uuid-3" } } },
        ],
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.created).toBe(3);
        expect(outcome.result.skipped).toBe(0);
      }
      // v1's batch route must not be used on this path.
      expect(captured.import).toHaveLength(0);
      expect(captured.createTask).toHaveLength(3);

      // Exact payloads and order: t1, then t2 (depends on t1's uuid), then t3
      // (depends on both t1's and t2's uuids).
      expect(captured.createTask[0]).toEqual({
        title: "Set up CI",
        priority: "MEDIUM",
        externalRef: "t1",
        labels: ["source:forge"],
      });
      expect(captured.createTask[1]).toEqual({
        title: "Write API",
        priority: "MEDIUM",
        externalRef: "t2",
        labels: ["source:forge"],
        dependsOn: ["uuid-1"],
      });
      expect(captured.createTask[2]).toEqual({
        title: "Write tests",
        priority: "MEDIUM",
        externalRef: "t3",
        labels: ["source:forge"],
        dependsOn: ["uuid-1", "uuid-2"],
      });
      expect(deleteSnapshot).toHaveBeenCalledWith("u1", REPO_URL);
    });

    it("is idempotent on re-run: a 409 on an already-imported task resolves via lookup and keeps downstream dependsOn correct", async () => {
      getSnapshot.mockResolvedValue([
        { id: "t1", title: "Already imported" },
        { id: "t2", title: "New task", dependsOn: ["t1"] },
      ]);
      mockFetch({
        available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
        createTaskSequence: [
          { status: 409, body: { error: "conflict", message: 'A task with externalRef "t1" already exists in this project' } },
          { status: 201, body: { task: { id: "uuid-2" } } },
        ],
        lookupByExternalRef: {
          t1: { status: 200, body: { tasks: [{ id: "existing-uuid-1" }], nextCursor: null } },
        },
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.created).toBe(1);
        expect(outcome.result.skipped).toBe(1);
        expect(outcome.result.failed).toBe(0);
      }
      // t2 depends on the *looked-up* uuid for the pre-existing t1, not a
      // freshly-created one.
      expect(captured.createTask[1]).toMatchObject({ externalRef: "t2", dependsOn: ["existing-uuid-1"] });
      expect(deleteSnapshot).toHaveBeenCalledWith("u1", REPO_URL);
    });

    it("hard-fails the migration when a 409 conflict cannot be resolved via lookup", async () => {
      getSnapshot.mockResolvedValue([
        { id: "t1", title: "Already imported" },
        { id: "t2", title: "New task", dependsOn: ["t1"] },
      ]);
      mockFetch({
        available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
        createTaskSequence: [
          { status: 409, body: { error: "conflict", message: "conflict" } },
        ],
        lookupByExternalRef: {
          t1: { status: 200, body: { tasks: [], nextCursor: null } },
        },
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(false);
      // Only t1 was attempted; the migration aborts before t2.
      expect(captured.createTask).toHaveLength(1);
      expect(deleteSnapshot).not.toHaveBeenCalled();
    });

    it("hard-fails the whole migration on an unexpected single-create error (not 201/409)", async () => {
      getSnapshot.mockResolvedValue([
        { id: "t1", title: "First" },
        { id: "t2", title: "Second", dependsOn: ["t1"] },
      ]);
      mockFetch({
        available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
        createTaskSequence: [
          { status: 201, body: { task: { id: "uuid-1" } } },
          { status: 500, body: { error: "internal_error", message: "boom" } },
        ],
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.status).toBe(500);
        expect(outcome.error).toBe("internal_error");
      }
      // t1 was created before the failure; t2's attempt is what failed.
      expect(captured.createTask).toHaveLength(2);
      expect(deleteSnapshot).not.toHaveBeenCalled();
    });

    it("returns a cyclic_dependencies outcome and creates nothing when the graph has a cycle", async () => {
      getSnapshot.mockResolvedValue([
        { id: "a", title: "A", dependsOn: ["b"] },
        { id: "b", title: "B", dependsOn: ["a"] },
      ]);
      mockFetch({
        available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.code).toBe("cyclic_dependencies");
        expect(outcome.cycle).toEqual(["a", "b", "a"]);
      }
      expect(captured.createTask).toHaveLength(0);
      expect(captured.import).toHaveLength(0);
      expect(deleteSnapshot).not.toHaveBeenCalled();
    });

    it("drops a dangling dependsOn edge and surfaces it as a warning on the result", async () => {
      getSnapshot.mockResolvedValue([{ id: "t1", title: "Task one", dependsOn: ["ghost"] }]);
      mockFetch({
        available: { status: 200, body: { projects: [{ id: "proj-x", githubRepo: OWNER_REPO, teamId: "team-1" }] } },
        createTaskSequence: [{ status: 201, body: { task: { id: "uuid-1" } } }],
      });

      const outcome = await migrateForgeTasks("u1", REPO_URL);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.warnings).toEqual(['Task "t1" depends on unknown planforge id "ghost" (dropped)']);
      }
      expect(captured.createTask[0]).not.toHaveProperty("dependsOn");
    });
  });
});
