import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PilotClient } from "../src/client.js";
import { registerTools } from "../src/tools.js";

/**
 * MUTATION COVERAGE — registerTools handler layer.
 *
 *   Guard E (force passthrough): deploy_app passes force:boolean from args to client.deployApp
 *     Mutation: hardcode force:false → handler test asserting force:true in call fails.
 *
 *   Guard F (error wrapping): catch(e) returns error() shape, not text()
 *     Mutation: remove try/catch → unhandled rejection instead of isError response.
 *
 *   Guard G (dashboard_summary degrade): uses Promise.allSettled, not Promise.all
 *     Mutation: use Promise.all → partial rejection causes whole handler to throw.
 */

// ── Shim McpServer ─────────────────────────────────────────────────────────────

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

function makeServer() {
  const captured: Record<string, Handler> = {};
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: Handler) => {
      captured[name] = handler;
    },
  };
  return { server, captured };
}

// ── Build a mock PilotClient ──────────────────────────────────────────────────

function makeClient(): PilotClient {
  return {
    listProjects: vi.fn(),
    generateProject: vi.fn(),
    publishProject: vi.fn(),
    listTaskProjects: vi.fn(),
    listTasks: vi.fn(),
    claimableTask: vi.fn(),
    getTaskInstructions: vi.fn(),
    claimTask: vi.fn(),
    createTask: vi.fn(),
    transitionTask: vi.fn(),
    listServers: vi.fn(),
    listApps: vi.fn(),
    deployApp: vi.fn(),
    getDeployStatus: vi.fn(),
    preflight: vi.fn(),
    rollback: vi.fn(),
    deployHistory: vi.fn(),
  } as unknown as PilotClient;
}

// ── text() and error() shape matchers ────────────────────────────────────────

function isTextResult(result: unknown): result is { content: [{ type: "text"; text: string }] } {
  const r = result as { content?: Array<{ type?: string; text?: string }>; isError?: unknown };
  return (
    Array.isArray(r?.content) &&
    r.content.length > 0 &&
    r.content[0]?.type === "text" &&
    typeof r.content[0]?.text === "string" &&
    !r.isError
  );
}

function isErrorResult(result: unknown): result is { content: [{ type: "text"; text: string }]; isError: true } {
  const r = result as { content?: Array<{ type?: string; text?: string }>; isError?: unknown };
  return (
    Array.isArray(r?.content) &&
    r.content.length > 0 &&
    r.content[0]?.type === "text" &&
    r.isError === true
  );
}

function parseText(result: unknown): unknown {
  const r = result as { content: [{ text: string }] };
  return JSON.parse(r.content[0].text);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("registerTools — forge tools", () => {
  let captured: Record<string, Handler>;
  let client: PilotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    const s = makeServer();
    registerTools(s.server as never, client);
    captured = s.captured;
  });

  it("forge_list_projects — returns text() wrapping client result on success", async () => {
    (client.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, projects: [{ id: "p1" }] });

    const result = await captured["forge_list_projects"]!({});

    expect(isTextResult(result)).toBe(true);
    expect((parseText(result) as { projects: unknown[] }).projects).toHaveLength(1);
  });

  it("forge_list_projects — returns error() shape when client throws", async () => {
    (client.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));

    const result = await captured["forge_list_projects"]!({});

    // GUARD F — mutation: remove catch → result would be a rejection, not isError
    expect(isErrorResult(result)).toBe(true);
    expect((parseText(result) as { error: string }).error).toBe("nope");
  });

  it("forge_create_project — calls client.generateProject with correct args", async () => {
    (client.generateProject as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, sessionId: "s1", preview: {} });

    await captured["forge_create_project"]!({
      projectName: "my-app",
      summary: "does stuff",
      features: ["auth"],
      constraints: ["typescript"],
    });

    expect(client.generateProject).toHaveBeenCalledWith({
      projectName: "my-app",
      summary: "does stuff",
      features: ["auth"],
      constraints: ["typescript"],
    });
  });

  it("forge_publish_project — calls client.publishProject with sessionId", async () => {
    (client.publishProject as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, result: { repoUrl: "x", projectName: "x" } });

    await captured["forge_publish_project"]!({ sessionId: "sess-42" });

    expect(client.publishProject).toHaveBeenCalledWith("sess-42");
  });

  it("forge_create_project — returns error() shape when client throws (catch block)", async () => {
    (client.generateProject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("forge err"));

    const result = await captured["forge_create_project"]!({
      projectName: "x",
      summary: "y",
    });
    expect(isErrorResult(result)).toBe(true);
  });

  it("forge_publish_project — returns error() shape when client throws (catch block)", async () => {
    (client.publishProject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("publish err"));

    const result = await captured["forge_publish_project"]!({ sessionId: "s-bad" });
    expect(isErrorResult(result)).toBe(true);
  });
});

describe("registerTools — tasks tools", () => {
  let captured: Record<string, Handler>;
  let client: PilotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    const s = makeServer();
    registerTools(s.server as never, client);
    captured = s.captured;
  });

  it("tasks_list_projects — returns text() on success", async () => {
    (client.listTaskProjects as ReturnType<typeof vi.fn>).mockResolvedValue({ projects: [] });

    const result = await captured["tasks_list_projects"]!({});
    expect(isTextResult(result)).toBe(true);
  });

  it("tasks_list_tasks — calls client.listTasks with projectId", async () => {
    (client.listTasks as ReturnType<typeof vi.fn>).mockResolvedValue({ tasks: [] });

    await captured["tasks_list_tasks"]!({ projectId: "proj-1" });

    expect(client.listTasks).toHaveBeenCalledWith("proj-1");
  });

  it("tasks_claimable — returns error() shape on client failure", async () => {
    (client.claimableTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("upstream down"));

    const result = await captured["tasks_claimable"]!({});
    expect(isErrorResult(result)).toBe(true);
  });

  it("tasks_get_instructions — calls client with taskId", async () => {
    (client.getTaskInstructions as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await captured["tasks_get_instructions"]!({ taskId: "t-99" });

    expect(client.getTaskInstructions).toHaveBeenCalledWith("t-99");
  });

  it("tasks_claim — calls client.claimTask with taskId", async () => {
    (client.claimTask as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await captured["tasks_claim"]!({ taskId: "t-77" });

    expect(client.claimTask).toHaveBeenCalledWith("t-77");
  });

  it("tasks_transition — calls client.transitionTask with taskId and status", async () => {
    (client.transitionTask as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await captured["tasks_transition"]!({ taskId: "t-55", status: "done" });

    expect(client.transitionTask).toHaveBeenCalledWith("t-55", "done");
  });

  it("tasks_list_projects — returns error() shape when client throws (catch block)", async () => {
    (client.listTaskProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("tasks err"));

    const result = await captured["tasks_list_projects"]!({});
    expect(isErrorResult(result)).toBe(true);
  });

  it("tasks_list_tasks — returns error() shape when client throws (catch block)", async () => {
    (client.listTasks as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("list err"));

    const result = await captured["tasks_list_tasks"]!({ projectId: "p-1" });
    expect(isErrorResult(result)).toBe(true);
  });

  it("tasks_get_instructions — returns error() shape when client throws (catch block)", async () => {
    (client.getTaskInstructions as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("instr err"));

    const result = await captured["tasks_get_instructions"]!({ taskId: "t-err" });
    expect(isErrorResult(result)).toBe(true);
  });

  it("tasks_claim — returns error() shape when client throws (catch block)", async () => {
    (client.claimTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("claim err"));

    const result = await captured["tasks_claim"]!({ taskId: "t-err" });
    expect(isErrorResult(result)).toBe(true);
  });

  it("tasks_transition — returns error() shape when client throws (catch block)", async () => {
    (client.transitionTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("trans err"));

    const result = await captured["tasks_transition"]!({ taskId: "t-err", status: "done" });
    expect(isErrorResult(result)).toBe(true);
  });

  it("tasks_create — calls client.createTask with projectId and task input", async () => {
    (client.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({ task: {} });

    await captured["tasks_create"]!({
      projectId: "proj-1",
      title: "Fix bug",
      priority: "HIGH",
    });

    expect(client.createTask).toHaveBeenCalledWith("proj-1", {
      title: "Fix bug",
      priority: "HIGH",
      description: undefined,
      template: undefined,
    });
  });

  it("tasks_create — returns error() shape when client throws (catch block)", async () => {
    (client.createTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("create err"));

    const result = await captured["tasks_create"]!({
      projectId: "proj-1",
      title: "Fail",
    });
    expect(isErrorResult(result)).toBe(true);
  });
});

describe("registerTools — deploy tools", () => {
  let captured: Record<string, Handler>;
  let client: PilotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    const s = makeServer();
    registerTools(s.server as never, client);
    captured = s.captured;
  });

  it("deploy_list_servers — returns text() on success", async () => {
    (client.listServers as ReturnType<typeof vi.fn>).mockResolvedValue({ servers: [] });

    const result = await captured["deploy_list_servers"]!({});
    expect(isTextResult(result)).toBe(true);
  });

  it("deploy_list_servers — returns error() shape when client throws (catch block)", async () => {
    (client.listServers as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("servers err"));

    const result = await captured["deploy_list_servers"]!({});
    expect(isErrorResult(result)).toBe(true);
  });

  it("deploy_list_apps — passes server_id to client.listApps", async () => {
    (client.listApps as ReturnType<typeof vi.fn>).mockResolvedValue({ apps: [] });

    await captured["deploy_list_apps"]!({ server_id: "srv-1" });

    expect(client.listApps).toHaveBeenCalledWith("srv-1");
  });

  it("deploy_list_apps — returns error() shape when client throws (catch block)", async () => {
    (client.listApps as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("apps err"));

    const result = await captured["deploy_list_apps"]!({});
    expect(isErrorResult(result)).toBe(true);
  });

  it("deploy_app — threads force:true through to client.deployApp (Guard E)", async () => {
    (client.deployApp as ReturnType<typeof vi.fn>).mockResolvedValue({ deploy: { id: "d1", status: "pending" } });

    await captured["deploy_app"]!({ server: "vps-01", app: "my-app", force: true });

    // GUARD E — mutation: hardcode force:false → call has force:false → fails
    expect(client.deployApp).toHaveBeenCalledWith(
      "vps-01",
      "my-app",
      expect.objectContaining({ force: true }),
    );
  });

  it("deploy_app — threads force:false through to client.deployApp", async () => {
    (client.deployApp as ReturnType<typeof vi.fn>).mockResolvedValue({ deploy: { id: "d1", status: "pending" } });

    await captured["deploy_app"]!({ server: "vps-01", app: "my-app", force: false });

    expect(client.deployApp).toHaveBeenCalledWith(
      "vps-01",
      "my-app",
      expect.objectContaining({ force: false }),
    );
  });

  it("deploy_app — returns error() when client.deployApp throws", async () => {
    (client.deployApp as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("deploy failed"));

    const result = await captured["deploy_app"]!({ server: "vps-01", app: "bad-app" });

    // GUARD F applied to deploy_app
    expect(isErrorResult(result)).toBe(true);
    expect((parseText(result) as { error: string }).error).toBe("deploy failed");
  });

  it("deploy_status — calls client.getDeployStatus with deployId", async () => {
    (client.getDeployStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ deploy: {} });

    await captured["deploy_status"]!({ deployId: "dep-1" });

    expect(client.getDeployStatus).toHaveBeenCalledWith("dep-1");
  });

  it("deploy_preflight — calls client.preflight with server and app", async () => {
    (client.preflight as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await captured["deploy_preflight"]!({ server: "vps-01", app: "my-app" });

    expect(client.preflight).toHaveBeenCalledWith("vps-01", "my-app");
  });

  it("deploy_rollback — calls client.rollback with server and app", async () => {
    (client.rollback as ReturnType<typeof vi.fn>).mockResolvedValue({ deploy: { id: "d-r", status: "rolled_back" } });

    await captured["deploy_rollback"]!({ server: "vps-01", app: "my-app" });

    expect(client.rollback).toHaveBeenCalledWith("vps-01", "my-app");
  });

  it("deploy_history — calls client.deployHistory with limit", async () => {
    (client.deployHistory as ReturnType<typeof vi.fn>).mockResolvedValue({ deploys: [] });

    await captured["deploy_history"]!({ limit: 5 });

    expect(client.deployHistory).toHaveBeenCalledWith(5);
  });

  it("deploy_status — returns error() shape when client throws (catch block)", async () => {
    (client.getDeployStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("not found"));

    const result = await captured["deploy_status"]!({ deployId: "d-x" });
    expect(isErrorResult(result)).toBe(true);
  });

  it("deploy_preflight — returns error() shape when client throws (catch block)", async () => {
    (client.preflight as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("preflight fail"));

    const result = await captured["deploy_preflight"]!({ server: "vps-01", app: "bad" });
    expect(isErrorResult(result)).toBe(true);
  });

  it("deploy_rollback — returns error() shape when client throws (catch block)", async () => {
    (client.rollback as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("rollback fail"));

    const result = await captured["deploy_rollback"]!({ server: "vps-01", app: "bad" });
    expect(isErrorResult(result)).toBe(true);
  });

  it("deploy_history — returns error() shape when client throws (catch block)", async () => {
    (client.deployHistory as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("hist fail"));

    const result = await captured["deploy_history"]!({ limit: 5 });
    expect(isErrorResult(result)).toBe(true);
  });
});

describe("registerTools — dashboard_summary (Guard G: Promise.allSettled degrade)", () => {
  let captured: Record<string, Handler>;
  let client: PilotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = makeClient();
    const s = makeServer();
    registerTools(s.server as never, client);
    captured = s.captured;
  });

  it("returns text() with full data when all 4 client calls succeed", async () => {
    (client.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      projects: [{ id: "p1" }, { id: "p2" }],
    });
    (client.claimableTask as ReturnType<typeof vi.fn>).mockResolvedValue({
      tasks: [{ id: "t1" }],
    });
    (client.listServers as ReturnType<typeof vi.fn>).mockResolvedValue({
      servers: [{ id: "s1", status: "online" }, { id: "s2", status: "offline" }],
    });
    (client.deployHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      deploys: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
    });

    const result = await captured["dashboard_summary"]!({});

    expect(isTextResult(result)).toBe(true);
    const data = parseText(result) as {
      forge: { projectCount: number };
      tasks: { claimableCount: number };
      deploy: { serverCount: number; onlineCount: number };
      recentDeploys: unknown[];
    };
    expect(data.forge.projectCount).toBe(2);
    expect(data.tasks.claimableCount).toBe(1);
    expect(data.deploy.serverCount).toBe(2);
    expect(data.deploy.onlineCount).toBe(1);
    expect(data.recentDeploys).toHaveLength(3);
  });

  it("degrades gracefully: returns text() even when 2 of 4 calls reject (Guard G)", async () => {
    // listProjects and listServers reject; claimableTask and deployHistory resolve
    (client.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("forge down"));
    (client.claimableTask as ReturnType<typeof vi.fn>).mockResolvedValue({ tasks: [] });
    (client.listServers as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("deploy down"));
    (client.deployHistory as ReturnType<typeof vi.fn>).mockResolvedValue({ deploys: [] });

    const result = await captured["dashboard_summary"]!({});

    // GUARD G — mutation: use Promise.all → handler throws → isErrorResult
    expect(isTextResult(result)).toBe(true);
    const data = parseText(result) as {
      forge: { error?: string };
      tasks: { claimableCount?: number };
      deploy: { error?: string };
      recentDeploys: unknown[];
    };
    expect(data.forge.error).toBe("forge down");
    expect(data.tasks.claimableCount).toBe(0);
    expect(data.deploy.error).toBe("deploy down");
    expect(data.recentDeploys).toHaveLength(0);
  });

  it("degrades gracefully: returns text() when all 4 calls reject", async () => {
    (client.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("err1"));
    (client.claimableTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("err2"));
    (client.listServers as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("err3"));
    (client.deployHistory as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("err4"));

    const result = await captured["dashboard_summary"]!({});

    // Even with total failure, must return text() not throw
    expect(isTextResult(result)).toBe(true);
    const data = parseText(result) as {
      recentDeploys: unknown[];
    };
    expect(data.recentDeploys).toHaveLength(0);
  });

  it("recentDeploys is sliced to at most 5 entries", async () => {
    (client.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("x"));
    (client.claimableTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("x"));
    (client.listServers as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("x"));
    // deployHistory returns 7 deploys but only 5 should appear
    (client.deployHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      deploys: [1, 2, 3, 4, 5, 6, 7],
    });

    const result = await captured["dashboard_summary"]!({});

    const data = parseText(result) as { recentDeploys: unknown[] };
    expect(data.recentDeploys).toHaveLength(5);
  });
});
