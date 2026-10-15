import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    CORS_ORIGINS: "http://localhost:3000",
    PROJECT_FORGE_URL: "http://forge.test",
    AGENT_TASKS_URL: "http://tasks.test",
    DEPLOY_PANEL_URL: "http://deploy.test",
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { serviceCredential: { findUnique: vi.fn(), findMany: vi.fn() } },
}));

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("userId", "user-a");
    await next();
  }),
}));

import { prisma } from "../src/lib/prisma.js";
import { encrypt } from "../src/lib/crypto.js";
import { app } from "../src/app.js";

const UNREADABLE_TOKEN = "not-encrypted";

/**
 * Seed the credential store: one stored row per key of `tokens`; the value
 * is the token as it sits in the database (use encrypt() for a readable
 * credential, any foreign string for an unreadable one).
 */
function storedCredentials(tokens: Record<string, string>) {
  (prisma.serviceCredential.findMany as any).mockResolvedValue(
    Object.keys(tokens).map((service) => ({
      id: `id-${service}`,
      service,
      label: null,
      updatedAt: new Date(),
    })),
  );
  (prisma.serviceCredential.findUnique as any).mockImplementation(
    async ({ where }: any) => {
      const service = where.userId_service.service as string;
      return service in tokens ? { token: tokens[service] } : null;
    },
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubDownstream() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/projects/available")) {
      return jsonResponse({ projects: [{ id: "p1", name: "P", slug: "p", description: "" }] });
    }
    if (url.includes("/api/tasks/claimable")) {
      return jsonResponse({ tasks: [{ id: "t1", title: "T", status: "open", priority: "low" }] });
    }
    if (url.includes("/api/v1/servers")) {
      return jsonResponse({
        servers: [{ id: "s1", name: "s1", host: "h", status: "online", appCount: 1 }],
      });
    }
    if (url.includes("/api/v1/apps")) {
      return jsonResponse({ apps: [{ name: "a", status: "ok", server_id: "s1", server_name: "s1" }] });
    }
    throw new Error(`unexpected downstream call: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GET /api/dashboard/summary with unreadable credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers 200: the unreadable service is flagged, the readable one still reports its data", async () => {
    storedCredentials({
      "project-forge": UNREADABLE_TOKEN,
      "agent-tasks": UNREADABLE_TOKEN,
      "deploy-panel": encrypt("deploy-token"),
    });
    const fetchMock = stubDownstream();

    const res = await app.request("/api/dashboard/summary");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      services: Record<string, Record<string, unknown>>;
    };
    expect(body.services["agent-tasks"]).toMatchObject({
      configured: true,
      unreadable: true,
      projectCount: null,
      claimableCount: null,
    });
    expect(body.services["project-forge"]).toMatchObject({
      configured: true,
      unreadable: true,
    });
    expect(body.services["deploy-panel"]).toMatchObject({
      configured: true,
      serverCount: 1,
      onlineCount: 1,
      appCount: 1,
    });
    expect(body.services["deploy-panel"].unreadable).toBeFalsy();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("tasks.test"))).toBe(false);
    expect(urls.some((url) => url.includes("deploy.test"))).toBe(true);
  });

  it("answers 200 with all services not configured when there are no credentials", async () => {
    storedCredentials({});
    const fetchMock = stubDownstream();

    const res = await app.request("/api/dashboard/summary");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      services: Record<string, Record<string, unknown>>;
    };
    for (const service of ["project-forge", "agent-tasks", "deploy-panel"]) {
      expect(body.services[service].configured).toBe(false);
      expect(body.services[service].unreadable).toBeFalsy();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves unreadable absent or false when every credential decrypts", async () => {
    storedCredentials({
      "agent-tasks": encrypt("tasks-token"),
      "deploy-panel": encrypt("deploy-token"),
    });
    stubDownstream();

    const res = await app.request("/api/dashboard/summary");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      services: Record<string, Record<string, unknown>>;
    };
    expect(body.services["agent-tasks"]).toMatchObject({
      configured: true,
      projectCount: 1,
      claimableCount: 1,
    });
    expect(body.services["agent-tasks"].unreadable ?? false).toBe(false);
    expect(body.services["deploy-panel"].unreadable ?? false).toBe(false);
    expect(body.services["project-forge"].unreadable ?? false).toBe(false);
  });

  it("answers 200: an unreadable deploy-panel credential is flagged, agent-tasks still reports its data", async () => {
    storedCredentials({
      "agent-tasks": encrypt("tasks-token"),
      "deploy-panel": UNREADABLE_TOKEN,
    });
    const fetchMock = stubDownstream();

    const res = await app.request("/api/dashboard/summary");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      services: Record<string, Record<string, unknown>>;
    };
    expect(body.services["deploy-panel"]).toMatchObject({
      configured: true,
      unreadable: true,
      serverCount: null,
      onlineCount: null,
      appCount: null,
    });
    expect(body.services["agent-tasks"]).toMatchObject({
      configured: true,
      projectCount: 1,
      claimableCount: 1,
    });
    expect(body.services["agent-tasks"].unreadable).toBeFalsy();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("deploy.test"))).toBe(false);
    expect(urls.some((url) => url.includes("tasks.test"))).toBe(true);
  });

  it("answers 500 when the readability check rejects with a generic error, not CredentialUnreadableError", async () => {
    (prisma.serviceCredential.findMany as any).mockResolvedValue([
      {
        id: "id-deploy-panel",
        service: "deploy-panel",
        label: null,
        updatedAt: new Date(),
      },
    ]);
    // The readability pre-check is the first getCredential to run; a generic
    // error there is not a CredentialUnreadableError, so the route must let it
    // reach app.onError (500) rather than swallow it. Later calls (only
    // reached if the route swallows the error) return a readable credential.
    (prisma.serviceCredential.findUnique as any)
      .mockRejectedValueOnce(new Error("generic lookup failure"))
      .mockResolvedValue({ token: encrypt("deploy-token") });
    stubDownstream();

    const res = await app.request("/api/dashboard/summary");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Internal server error");
  });
});
