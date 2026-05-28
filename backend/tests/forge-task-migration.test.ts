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

import { migrateForgeTasks, parseOwnerRepo } from "../src/services/forge-task-migration.js";
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
}

// Records the JSON bodies POSTed per route so tests can assert the mapped payload.
const captured: { createProject: unknown[]; import: unknown[] } = { createProject: [], import: [] };

function mockFetch(routes: MockRoutes) {
  captured.createProject = [];
  captured.import = [];
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
});
