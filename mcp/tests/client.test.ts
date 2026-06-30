import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../src/config.js";
import { PilotClient } from "../src/client.js";

/**
 * MUTATION COVERAGE — PilotClient request layer.
 *
 *   Guard A (!res.ok guard): `if (!res.ok)` throws with parsed error
 *     Mutation: invert/remove guard → successful path taken on failure → test asserting throw fails.
 *
 *   Guard B (auth header routing): each of forgeRequest/tasksRequest/deployRequest
 *     attaches the correct header.
 *     Mutation: swap header names → inspect call assertion fails.
 *
 *   Guard C (error message priority): `err.error ?? err.message ?? "HTTP ${res.status}"`
 *     Mutation: reorder or drop fallback → wrong message in thrown error.
 *
 *   Guard D (json parse fallback): on json() throw, catch falls back to statusText.
 *     Mutation: remove catch → propagates json-parse error rather than statusText.
 */

const testConfig: Config = {
  forgeUrl: "https://forge.test",
  forgeApiKey: "forge-key-123",
  tasksUrl: "https://tasks.test",
  tasksToken: "tasks-token-456",
  deployUrl: "https://deploy.test",
  deployApiKey: "deploy-key-789",
};

function makeOkResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => data,
  } as unknown as Response;
}

function makeErrorResponse(opts: {
  status: number;
  statusText?: string;
  body?: Record<string, string>;
  jsonThrows?: boolean;
}): Response {
  return {
    ok: false,
    status: opts.status,
    statusText: opts.statusText ?? "Error",
    json: opts.jsonThrows
      ? async () => { throw new Error("parse failure"); }
      : async () => opts.body ?? {},
  } as unknown as Response;
}

describe("PilotClient — auth header routing", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PilotClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new PilotClient(testConfig);
  });

  it("forgeRequest sends X-API-Key header with the forge api key", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, projects: [] }));
    await client.listProjects();

    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    // GUARD B — mutation: use Authorization instead of X-API-Key → fails
    expect(headers["X-API-Key"]).toBe("forge-key-123");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("tasksRequest sends Authorization: Bearer <tasksToken>", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ projects: [] }));
    await client.listTaskProjects();

    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    // GUARD B — mutation: omit Bearer prefix → test fails
    expect(headers["Authorization"]).toBe("Bearer tasks-token-456");
    expect(headers["X-API-Key"]).toBeUndefined();
  });

  it("deployRequest sends Authorization: Bearer <deployApiKey>", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ servers: [] }));
    await client.listServers();

    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer deploy-key-789");
    expect(headers["X-API-Key"]).toBeUndefined();
  });

  it("all requests set Content-Type: application/json", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, projects: [] }));
    await client.listProjects();

    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("PilotClient — !res.ok error handling (Guard A)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PilotClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new PilotClient(testConfig);
  });

  it("throws Error with err.error when !res.ok and body has error field", async () => {
    fetchMock.mockResolvedValue(
      makeErrorResponse({ status: 400, body: { error: "boom" } }),
    );

    // GUARD A — mutation: remove !res.ok guard → no throw → test fails
    await expect(client.listProjects()).rejects.toThrow(/boom/);
  });

  it("throws Error with err.message when !res.ok and body has no error field", async () => {
    fetchMock.mockResolvedValue(
      makeErrorResponse({ status: 500, body: { message: "internal failure" } }),
    );

    // GUARD C — mutation: skip err.message fallback → throws "HTTP 500" instead
    await expect(client.listProjects()).rejects.toThrow(/internal failure/);
  });

  it("throws HTTP <status> when !res.ok and body has no recognized field", async () => {
    fetchMock.mockResolvedValue(
      makeErrorResponse({ status: 503, body: {} }),
    );

    // GUARD C — mutation: remove final fallback → undefined message
    await expect(client.listProjects()).rejects.toThrow(/HTTP 503/);
  });

  it("falls back to statusText when json() throws (Guard D)", async () => {
    fetchMock.mockResolvedValue(
      makeErrorResponse({ status: 502, statusText: "Bad Gateway", jsonThrows: true }),
    );

    // GUARD D — mutation: remove .catch(() => ...) → json parse error propagates
    await expect(client.listProjects()).rejects.toThrow(/Bad Gateway/);
  });

  it("err.error takes priority over err.message (Guard C priority order)", async () => {
    fetchMock.mockResolvedValue(
      makeErrorResponse({
        status: 422,
        body: { error: "from-error-field", message: "from-message-field" },
      }),
    );

    // GUARD C — mutation: swap ?? order → throws "from-message-field" instead
    await expect(client.listProjects()).rejects.toThrow(/from-error-field/);
  });
});

describe("PilotClient — URL construction", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PilotClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new PilotClient(testConfig);
  });

  it("deployHistory appends limit query param to the URL", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ deploys: [] }));
    await client.deployHistory(10);

    const [url] = fetchMock.mock.calls[0] as [string];
    // GUARD — mutation: hardcode limit=20 → "?limit=10" missing → fails
    expect(url).toBe("https://deploy.test/api/v1/deploys?limit=10");
  });

  it("listApps with serverId appends server_id query param", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ apps: [] }));
    await client.listApps("srv-1");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://deploy.test/api/v1/apps?server_id=srv-1");
  });

  it("listApps without serverId omits query string", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ apps: [] }));
    await client.listApps();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://deploy.test/api/v1/apps");
  });

  it("forgeRequest calls the correct forgeUrl base", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, projects: [] }));
    await client.listProjects();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^https:\/\/forge\.test/);
  });

  it("tasksRequest calls the correct tasksUrl base", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ projects: [] }));
    await client.listTaskProjects();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^https:\/\/tasks\.test/);
  });

  it("deployRequest calls the correct deployUrl base", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ servers: [] }));
    await client.listServers();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^https:\/\/deploy\.test/);
  });
});

describe("PilotClient — AbortSignal.timeout", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PilotClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new PilotClient(testConfig);
  });

  it("rejects when fetch rejects with an AbortError", async () => {
    const abortErr = new DOMException("The operation was aborted.", "AbortError");
    fetchMock.mockRejectedValue(abortErr);

    await expect(client.listProjects()).rejects.toThrow("The operation was aborted.");
  });
});

describe("PilotClient — thin-wrapper method routing (coverage sweep)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PilotClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new PilotClient(testConfig);
  });

  it("publishProject posts to /api/v1/publish with sessionId in body", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, result: { repoUrl: "x", projectName: "x" } }));
    await client.publishProject("sess-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://forge.test/api/v1/publish");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sessionId: "sess-1" });
  });

  it("listTasks calls GET /api/projects/:projectId/tasks", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ tasks: [] }));
    await client.listTasks("proj-42");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://tasks.test/api/projects/proj-42/tasks");
  });

  it("claimableTask calls GET /api/tasks/claimable", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ tasks: [] }));
    await client.claimableTask();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://tasks.test/api/tasks/claimable");
  });

  it("getTaskInstructions calls GET /api/tasks/:taskId/instructions", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({}));
    await client.getTaskInstructions("t-1");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://tasks.test/api/tasks/t-1/instructions");
  });

  it("claimTask calls POST /api/tasks/:taskId/claim", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({}));
    await client.claimTask("t-2");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tasks.test/api/tasks/t-2/claim");
    expect(init.method).toBe("POST");
  });

  it("createTask calls POST /api/projects/:projectId/tasks with body", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ task: {} }));
    await client.createTask("proj-1", { title: "Fix it", priority: "HIGH" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tasks.test/api/projects/proj-1/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ title: "Fix it", priority: "HIGH" });
  });

  it("transitionTask calls POST /api/tasks/:taskId/transition with status in body", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({}));
    await client.transitionTask("t-3", "done");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tasks.test/api/tasks/t-3/transition");
    expect(JSON.parse(init.body as string)).toEqual({ status: "done" });
  });

  it("getDeployStatus calls GET /api/v1/deploy/:deployId", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ deploy: {} }));
    await client.getDeployStatus("dep-99");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://deploy.test/api/v1/deploy/dep-99");
  });

  it("preflight calls POST /api/v1/preflight with server and app", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({}));
    await client.preflight("vps-01", "my-app");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://deploy.test/api/v1/preflight");
    expect(JSON.parse(init.body as string)).toEqual({ server: "vps-01", app: "my-app" });
  });

  it("rollback calls POST /api/v1/rollback with server and app", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ deploy: { id: "d-r", status: "rolled_back" } }));
    await client.rollback("vps-01", "my-app");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://deploy.test/api/v1/rollback");
    expect(JSON.parse(init.body as string)).toEqual({ server: "vps-01", app: "my-app" });
  });
});

describe("PilotClient — request bodies", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: PilotClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client = new PilotClient(testConfig);
  });

  it("GET requests have no body (undefined)", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, projects: [] }));
    await client.listProjects();

    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect(init.method).toBe("GET");
  });

  it("POST requests serialize body as JSON", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, sessionId: "s1", preview: {} }));
    await client.generateProject({ projectName: "foo", summary: "bar" });

    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ projectName: "foo", summary: "bar" }));
  });

  it("deployApp passes server, app, and opts (including force) to body", async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ deploy: { id: "d1", status: "pending" } }));
    await client.deployApp("vps-01", "my-app", { force: true, ref: "main" });

    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      server: "vps-01",
      app: "my-app",
      force: true,
      ref: "main",
    });
  });
});
