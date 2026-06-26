import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep config import side effects (env validation) out of the test.
vi.mock("../config/index.js", () => ({
  config: { DEPLOY_PANEL_URL: "http://deploy-panel.test" },
}));

// requireAuth normally validates a session; here it just injects a userId so
// the route handler can run.
vi.mock("../middleware/auth.js", () => ({
  requireAuth: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "user-1");
    await next();
  },
}));

vi.mock("../services/credentials.js", () => ({
  getCredential: vi.fn(async () => "dp-token"),
}));

import { deploy } from "./deploy.js";

function postServers(body: unknown) {
  return deploy.request("/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function forwardedBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("POST /deploy/servers proxy schema", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ id: "srv-1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("accepts {name, host}, forwards exactly those fields to /api/servers, and returns the panel response", async () => {
    const res = await postServers({ name: "web-1", host: "1.2.3.4" });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "srv-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://deploy-panel.test/api/servers");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dp-token");
    expect(forwardedBody(fetchMock)).toEqual({ name: "web-1", host: "1.2.3.4" });
  });

  it("accepts optional relayUrl/relayToken and forwards them", async () => {
    await postServers({
      name: "web-1",
      host: "1.2.3.4",
      relayUrl: "https://relay.example.com",
      relayToken: "secret",
    });

    expect(forwardedBody(fetchMock)).toEqual({
      name: "web-1",
      host: "1.2.3.4",
      relayUrl: "https://relay.example.com",
      relayToken: "secret",
    });
  });

  it("rejects a missing name with 400 and does not call deploy-panel", async () => {
    const res = await postServers({ host: "1.2.3.4" });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing host with 400 and does not call deploy-panel", async () => {
    const res = await postServers({ name: "web-1" });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed relayUrl with 400 and does not call deploy-panel", async () => {
    const res = await postServers({ name: "web-1", host: "1.2.3.4", relayUrl: "not-a-url" });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips unknown keys (e.g. sshKeyPath) before forwarding", async () => {
    await postServers({ name: "web-1", host: "1.2.3.4", sshKeyPath: "/home/x/.ssh/id" });

    const body = forwardedBody(fetchMock);
    expect(body).not.toHaveProperty("sshKeyPath");
    expect(body).toEqual({ name: "web-1", host: "1.2.3.4" });
  });
});
