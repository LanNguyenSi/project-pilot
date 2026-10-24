import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * zod 4 migration contract pins.
 *
 * Every case pins the ENCODED wire body (response text parsed as JSON), not
 * the in-memory object, per the zod 4 rule that `issues` on ZodError is
 * non-enumerable. The 400 envelope from the shared zValidate hook must stay
 * { success: false, error: { issues: [...], name: "ZodError" } } with status
 * 400, matching the zod 3 wire body key for key (only zod's own issue
 * code/message texts may differ).
 */

vi.mock("../src/middleware/rate-limit.js", () => ({
  rateLimit: () => (_c: any, next: any) => next(),
}));

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

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn() },
    passwordReset: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

vi.mock("../src/services/auth.js", () => ({
  registerUser: vi.fn().mockResolvedValue({ id: "u1", email: "a@b.co", name: null, createdAt: new Date() }),
  loginUser: vi.fn(),
  generateSessionToken: vi.fn().mockReturnValue("tok"),
  hashToken: vi.fn((t: string) => `hash_${t}`),
  hashPassword: vi.fn().mockResolvedValue("$2b$12$fakehash"),
}));

vi.mock("../src/services/credentials.js", () => ({
  getCredential: vi.fn(),
  upsertCredential: vi.fn(),
  listCredentials: vi.fn(),
  deleteCredential: vi.fn(),
  isValidService: vi.fn(),
  CredentialUnreadableError: class extends Error {},
}));

vi.mock("../src/services/agent-tasks-client.js", () => ({
  agentTasksRequest: vi.fn(),
}));

vi.mock("../src/services/forge-task-snapshot.js", () => ({
  extractPreviewTasks: vi.fn(),
  saveForgeTaskSnapshot: vi.fn(),
  linkForgeSnapshotToRepo: vi.fn(),
}));

vi.mock("../src/services/forge-task-migration.js", () => ({
  migrateForgeTasks: vi.fn(),
}));

import { auth } from "../src/routes/auth.js";
import { credentials } from "../src/routes/credentials.js";
import { deploy } from "../src/routes/deploy.js";
import { forge } from "../src/routes/forge.js";
import { tasks } from "../src/routes/tasks.js";
import { getCredential } from "../src/services/credentials.js";
import { agentTasksRequest } from "../src/services/agent-tasks-client.js";
import { migrateForgeTasks } from "../src/services/forge-task-migration.js";

const mockGetCredential = vi.mocked(getCredential);
const mockTasksRequest = vi.mocked(agentTasksRequest);
const mockMigrateForgeTasks = vi.mocked(migrateForgeTasks);

function post(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  path: string,
  body: unknown,
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
      body: JSON.stringify(body),
    }),
  );
}

/** Pin the encoded 400 body: status, envelope keys, issue paths. */
async function expectWireBody400(res: Response, paths: (string[])[]) {
  expect(res.status).toBe(400);
  const body = JSON.parse(await res.text());
  expect(Object.keys(body)).toEqual(["success", "error"]);
  expect(body.success).toBe(false);
  expect(Object.keys(body.error)).toEqual(["issues", "name"]);
  expect(body.error.name).toBe("ZodError");
  expect(Array.isArray(body.error.issues)).toBe(true);
  expect(body.error.issues.length).toBe(paths.length);
  for (let i = 0; i < paths.length; i++) {
    const issue = body.error.issues[i] as Record<string, unknown>;
    expect(typeof issue.code).toBe("string");
    expect(typeof issue.message).toBe("string");
    expect(issue.path).toEqual(paths[i]);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockTasksRequest.mockResolvedValue({ ok: true, data: { id: "x" } } as never);
  mockMigrateForgeTasks.mockResolvedValue({ ok: true, result: { ok: true } } as never);
  mockGetCredential.mockResolvedValue("deploy-panel-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("400 wire body per route family (encoded body pin)", () => {
  it("auth: register keeps {success:false,error:{issues,name}} shape", async () => {
    const res = await post(auth, "/register", { email: "nope", password: "short" });
    await expectWireBody400(res, [["email"], ["password"]]);
  });

  it("credentials: upsert keeps the 400 envelope", async () => {
    const res = await credentials.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest" },
      body: JSON.stringify({ service: "nope", token: "" }),
    });
    await expectWireBody400(res, [["service"], ["token"]]);
  });

  it("deploy: trigger keeps the 400 envelope", async () => {
    const res = await post(deploy, "/trigger", {});
    await expectWireBody400(res, [["server"], ["app"]]);
  });

  it("forge: migrate-tasks keeps the 400 envelope", async () => {
    const res = await post(forge, "/migrate-tasks", { repoUrl: "not a url", teamId: "nope" });
    await expectWireBody400(res, [["repoUrl"], ["teamId"]]);
  });

  it("tasks: createProject keeps the 400 envelope", async () => {
    const res = await post(tasks, "/projects", { name: "", slug: "BAD", teamId: "nope" });
    await expectWireBody400(res, [["name"], ["slug"], ["teamId"]]);
  });
});

describe("z.email() keeps the zod 3 accept set (register.email)", () => {
  const accepted = ["user+tag@sub.example.co.uk", "a@b.co", "user@example.cafe", "user@exam-ple.com"];
  const rejected = ["user@localhost", "a@b.c", "user name@example.com", "user@@example.com", "user@exam_ple.com"];

  for (const email of accepted) {
    it(`accepts ${email} (same as zod 3)`, async () => {
      const res = await post(auth, "/register", { email, password: "password123" });
      expect(res.status).toBe(201);
    });
  }
  for (const email of rejected) {
    it(`rejects ${email} with the 400 envelope (same as zod 3)`, async () => {
      const res = await post(auth, "/register", { email, password: "password123" });
      await expectWireBody400(res, [["email"]]);
    });
  }
});

describe("z.guid() keeps the zod 3 .uuid() accept set (tasks.createProject.teamId)", () => {
  const accepted = [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-1111-1111-111111111111",
    "DEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF",
    "550e8400-e29b-41d4-a716-446655440000",
  ];
  const rejected = ["not-a-uuid", "{550e8400-e29b-41d4-a716-446655440000}", "550e8400e29b41d4a716446655440000", "abc"];

  for (const teamId of accepted) {
    it(`accepts ${teamId} and passes the value through unchanged`, async () => {
      const res = await post(tasks, "/projects", { name: "n", slug: "s", teamId });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe("x");
      expect(mockTasksRequest).toHaveBeenCalledWith(
        "user-1",
        "/api/projects",
        expect.objectContaining({
          body: JSON.stringify({ name: "n", slug: "s", teamId }),
        }),
      );
    });
  }
  for (const teamId of rejected) {
    it(`rejects ${teamId} (same as zod 3)`, async () => {
      const res = await post(tasks, "/projects", { name: "n", slug: "s", teamId });
      await expectWireBody400(res, [["teamId"]]);
    });
  }
});

describe("z.guid() optional teamId + z.url() repoUrl (forge.migrate-tasks)", () => {
  it("accepts a missing optional teamId (same as zod 3)", async () => {
    const res = await post(forge, "/migrate-tasks", { repoUrl: "https://github.com/o/r" });
    expect(res.status).toBe(200);
    expect(mockMigrateForgeTasks).toHaveBeenCalledWith("user-1", "https://github.com/o/r", undefined);
  });

  it("accepts non-RFC teamId 00000000-0000-0000-0000-000000000001 and forwards it unchanged", async () => {
    const teamId = "00000000-0000-0000-0000-000000000001";
    const res = await post(forge, "/migrate-tasks", { repoUrl: "https://github.com/o/r", teamId });
    expect(res.status).toBe(200);
    expect(mockMigrateForgeTasks).toHaveBeenCalledWith("user-1", "https://github.com/o/r", teamId);
  });

  it("rejects teamId nope", async () => {
    const res = await post(forge, "/migrate-tasks", { repoUrl: "https://github.com/o/r", teamId: "nope" });
    await expectWireBody400(res, [["teamId"]]);
  });

  const urls = ["http://example.com", "https://example.com/path?q=1#frag", "ftp://example.com", "HTTP://EXAMPLE.COM/Path"];
  for (const repoUrl of urls) {
    it(`accepts ${repoUrl} and forwards the value byte-identically (no normalization)`, async () => {
      const res = await post(forge, "/migrate-tasks", { repoUrl });
      expect(res.status).toBe(200);
      expect(mockMigrateForgeTasks).toHaveBeenCalledWith("user-1", repoUrl, undefined);
    });
  }
  const bad = ["not-a-url", "example.com", "//example.com", ""];
  for (const repoUrl of bad) {
    it(`rejects ${JSON.stringify(repoUrl)} (same as zod 3)`, async () => {
      const res = await post(forge, "/migrate-tasks", { repoUrl });
      await expectWireBody400(res, [["repoUrl"]]);
    });
  }
});

describe("z.url() relayUrl optional + output identity (deploy.createServer)", () => {
  function stubFetch() {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body as string | undefined });
        return new Response(JSON.stringify({ server: { id: "s1" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    return calls;
  }

  it("forwards relayUrl unchanged (same as zod 3 which never normalized)", async () => {
    const calls = stubFetch();
    const res = await post(deploy, "/servers", {
      name: "web-1",
      host: "1.2.3.4",
      relayUrl: "https://relay.example.com:8080/a",
    });
    expect(res.status).toBe(201);
    expect(JSON.parse(calls[0]!.body!).relayUrl).toBe("https://relay.example.com:8080/a");
  });

  it("accepts a missing optional relayUrl", async () => {
    stubFetch();
    const res = await post(deploy, "/servers", { name: "web-1", host: "1.2.3.4" });
    expect(res.status).toBe(201);
  });

  it("rejects relayUrl 'not a url' (same as zod 3)", async () => {
    const res = await post(deploy, "/servers", { name: "web-1", host: "1.2.3.4", relayUrl: "not a url" });
    await expectWireBody400(res, [["relayUrl"]]);
  });
});

describe("defaults + .refine short-circuit (deploy.probe-vps, zod 4 defaults)", () => {
  function stubFetch() {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body as string | undefined });
        return new Response(JSON.stringify({ probe: {}, hostKeySha256: "x".repeat(44) }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    return calls;
  }

  it("applies sshUser=root and sshPort=22 defaults even with the XOR .refine present", async () => {
    const calls = stubFetch();
    const res = await post(deploy, "/probe-vps", { host: "1.2.3.4", sshPassword: "s3cret" });
    expect(res.status).toBe(200);
    const forwarded = JSON.parse(calls[0]!.body!) as Record<string, unknown>;
    expect(forwarded.sshUser).toBe("root");
    expect(forwarded.sshPort).toBe(22);
    expect(forwarded.sshPassword).toBe("s3cret");
  });

  it("keeps explicit sshUser/sshPort values", async () => {
    const calls = stubFetch();
    const res = await post(deploy, "/probe-vps", {
      host: "1.2.3.4",
      sshPassword: "s3cret",
      sshUser: "deploy",
      sshPort: 2222,
    });
    expect(res.status).toBe(200);
    const forwarded = JSON.parse(calls[0]!.body!) as Record<string, unknown>;
    expect(forwarded.sshUser).toBe("deploy");
    expect(forwarded.sshPort).toBe(2222);
  });

  it("XOR refine still rejects neither credential", async () => {
    const res = await post(deploy, "/probe-vps", { host: "1.2.3.4" });
    await expectWireBody400(res, [[]]);
  });

  it("XOR refine still rejects both credentials", async () => {
    const res = await post(deploy, "/probe-vps", { host: "1.2.3.4", sshPassword: "a", sshPrivateKey: "b" });
    await expectWireBody400(res, [[]]);
  });
});
