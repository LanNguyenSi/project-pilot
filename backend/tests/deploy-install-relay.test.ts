import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock calls are hoisted before imports by Vitest.

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    session: {
      // requireAuth calls this to validate the session cookie. Always return
      // a valid, non-expired session so auth passes in every test.
      findUnique: vi.fn().mockResolvedValue({
        id: "sess-1",
        tokenHash: "any",
        expiresAt: new Date(Date.now() + 3_600_000),
        user: { id: "user-1", email: "test@example.com", name: "Test" },
      }),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../src/services/credentials.js", () => ({
  getCredential: vi.fn(),
}));

vi.mock("../src/config/index.js", () => ({
  config: {
    DEPLOY_PANEL_URL: "https://deploy-panel.test",
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    DATABASE_URL: "postgresql://test",
    CORS_ORIGINS: "http://localhost:3000",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    PORT: 3001,
    PROJECT_FORGE_URL: "https://project-forge.test",
    AGENT_TASKS_URL: "https://agent-tasks.test",
  },
  hasGitHubOAuthConfigured: false,
}));

import { getCredential } from "../src/services/credentials.js";
import { deploy } from "../src/routes/deploy.js";

const mockGetCredential = vi.mocked(getCredential);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST to /install-relay on the deploy router with a fake authenticated session. */
async function installRelay(body: unknown, cookie = "session=fake-token"): Promise<Response> {
  return deploy.request("/install-relay", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

/** Build a mock `text/event-stream` Response backed by a ReadableStream. */
function makeSseResponse(status: number, bodyText: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(bodyText));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /deploy/install-relay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // --- Validation ---------------------------------------------------------

  it("returns 400 when name is missing", async () => {
    const res = await installRelay({ host: "1.2.3.4", sshPassword: "secret" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when host is missing", async () => {
    const res = await installRelay({ name: "my-vps", sshPassword: "secret" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither sshPassword nor sshPrivateKey is provided (refine)", async () => {
    const res = await installRelay({ name: "my-vps", host: "1.2.3.4" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when BOTH sshPassword and sshPrivateKey are provided (XOR refine)", async () => {
    const res = await installRelay({
      name: "my-vps",
      host: "1.2.3.4",
      sshPassword: "secret",
      sshPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----",
    });
    expect(res.status).toBe(400);
  });

  it("accepts sshPrivateKey without sshPassword", async () => {
    // Only credential check happens after validation — mock it to avoid 409.
    mockGetCredential.mockResolvedValue(null);
    const res = await installRelay({
      name: "my-vps",
      host: "1.2.3.4",
      sshPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----",
    });
    // 409 = validation passed, credential check failed → correct
    expect(res.status).toBe(409);
  });

  // --- Missing credential --------------------------------------------------

  it("returns 409 with a clear message when deploy-panel credential is not configured", async () => {
    mockGetCredential.mockResolvedValue(null);
    const res = await installRelay({ name: "my-vps", host: "1.2.3.4", sshPassword: "s" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("deploy_panel_not_connected");
    expect(body.message).toMatch(/connect deploy-panel/i);
  });

  // --- Happy path (streaming) ---------------------------------------------

  it("proxies to deploy-panel and streams SSE back verbatim", async () => {
    mockGetCredential.mockResolvedValue("dp_test_token_abc");

    const sseBody =
      `event: progress\ndata: {"stream":"stdout","line":"Starting install"}\n\n` +
      `event: done\ndata: {"serverId":"s1","name":"my-vps","host":"1.2.3.4","relayUrl":"https://relay.example.com"}\n\n`;

    let capturedUrl: string | undefined;
    let capturedAuthHeader: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    let capturedSignal: unknown;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedUrl = url;
        const headers = init?.headers as Record<string, string> | undefined;
        capturedAuthHeader = headers?.["Authorization"];
        capturedBody = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
        capturedSignal = init?.signal;
        return Promise.resolve(makeSseResponse(200, sseBody));
      }),
    );

    // Spy on every console method a credential leak could plausibly use, not
    // just log/error (a console.warn/info leak would otherwise slip through).
    const consoleSpies = (["log", "error", "warn", "info", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );

    const res = await installRelay({
      name: "my-vps",
      host: "1.2.3.4",
      sshPassword: "super-secret-password",
      sshPort: 2222,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    // Verify the correct upstream URL was called.
    expect(capturedUrl).toBe("https://deploy-panel.test/api/servers/install-relay");

    // Verify the dp_ Bearer token is forwarded.
    expect(capturedAuthHeader).toBe("Bearer dp_test_token_abc");

    // Verify SSH credentials are forwarded in the body (proving forwarding).
    expect(capturedBody?.["sshPassword"]).toBe("super-secret-password");
    expect(capturedBody?.["host"]).toBe("1.2.3.4");
    expect(capturedBody?.["sshPort"]).toBe(2222);

    // The upstream fetch must receive an AbortSignal so a client disconnect
    // cancels the long-running install (no orphaned ~10-min SSH process).
    expect(capturedSignal).toBeInstanceOf(AbortSignal);

    // SSH credentials must NOT appear in ANY console output.
    const allLogs = consoleSpies.flatMap((s) => s.mock.calls.flat()).join(" ");
    expect(allLogs).not.toContain("super-secret-password");

    // SSE events must stream through to the caller.
    const text = await res.text();
    expect(text).toContain("event: progress");
    expect(text).toContain("event: done");
    expect(text).toContain('"relayUrl":"https://relay.example.com"');

    // Negative control: the secret must never appear in the streamed response.
    expect(text).not.toContain("super-secret-password");

    consoleSpies.forEach((s) => s.mockRestore());
  });

  // --- Upstream non-ok ----------------------------------------------------

  it("returns a JSON error (not a stream) when deploy-panel rejects with 401", async () => {
    mockGetCredential.mockResolvedValue("dp_bad_token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Unauthorized — invalid API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const res = await installRelay({
      name: "my-vps",
      host: "1.2.3.4",
      sshPassword: "sentinel-secret-xyz",
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("install_relay_failed");
    expect(body.message).toBe("Unauthorized — invalid API key");
    // The upstream-error path must not echo the submitted SSH secret.
    expect(JSON.stringify(body)).not.toContain("sentinel-secret-xyz");
    // The response must not be a stream.
    expect(res.headers.get("Content-Type")).not.toContain("text/event-stream");
  });

  it("returns a JSON error when deploy-panel rejects with 400 (upstream validation)", async () => {
    mockGetCredential.mockResolvedValue("dp_token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "bad_request", message: "exactly one of sshPassword or sshPrivateKey must be provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const res = await installRelay({ name: "my-vps", host: "1.2.3.4", sshPassword: "s" });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("install_relay_failed");
  });
});
