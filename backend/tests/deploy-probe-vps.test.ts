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

/** POST to /probe-vps on the deploy router with a fake authenticated session. */
async function probeVps(body: unknown, cookie = "session=fake-token"): Promise<Response> {
  return deploy.request("/probe-vps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

/** A realistic probe JSON response from deploy-panel. */
const happyProbeResponse = {
  probe: {
    port80: { kind: "free" },
    port443: { kind: "free" },
    containers: [],
    networks: [],
    suggestedMode: "greenfield",
  },
  hostKeySha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /deploy/probe-vps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // --- Validation -----------------------------------------------------------

  it("returns 400 when host is missing", async () => {
    const res = await probeVps({ sshPassword: "secret" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither sshPassword nor sshPrivateKey is provided (XOR refine)", async () => {
    const res = await probeVps({ host: "1.2.3.4" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when BOTH sshPassword and sshPrivateKey are provided (XOR refine)", async () => {
    const res = await probeVps({
      host: "1.2.3.4",
      sshPassword: "secret",
      sshPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----",
    });
    expect(res.status).toBe(400);
  });

  it("accepts sshPrivateKey without sshPassword", async () => {
    // Only credential check happens after validation — mock it to 409.
    mockGetCredential.mockResolvedValue(null);
    const res = await probeVps({
      host: "1.2.3.4",
      sshPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----",
    });
    // 409 = validation passed, credential check failed → correct
    expect(res.status).toBe(409);
  });

  // --- Missing credential ---------------------------------------------------

  it("returns 409 with a clear message when deploy-panel credential is not configured", async () => {
    mockGetCredential.mockResolvedValue(null);
    const res = await probeVps({ host: "1.2.3.4", sshPassword: "s" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("deploy_panel_not_connected");
    expect(body.message).toMatch(/connect deploy-panel/i);
  });

  // --- Happy path -----------------------------------------------------------

  it("proxies to deploy-panel and returns the probe JSON", async () => {
    mockGetCredential.mockResolvedValue("dp_test_token_abc");

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
        return Promise.resolve(
          new Response(JSON.stringify(happyProbeResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    // Spy on every console method — a credential leak would appear in these.
    const consoleSpies = (["log", "error", "warn", "info", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );

    const res = await probeVps({
      host: "1.2.3.4",
      sshPassword: "super-secret-probe-password",
      sshPort: 2222,
    });

    expect(res.status).toBe(200);

    // Verify the correct upstream URL was called.
    expect(capturedUrl).toBe("https://deploy-panel.test/api/servers/probe-vps");

    // Verify the dp_ Bearer token is forwarded.
    expect(capturedAuthHeader).toBe("Bearer dp_test_token_abc");

    // Verify host + SSH credentials are forwarded in the body.
    expect(capturedBody?.["host"]).toBe("1.2.3.4");
    expect(capturedBody?.["sshPassword"]).toBe("super-secret-probe-password");
    expect(capturedBody?.["sshPort"]).toBe(2222);

    // The upstream fetch must receive an AbortSignal (the 45s timeout).
    expect(capturedSignal).toBeInstanceOf(AbortSignal);

    // SSH credentials must NOT appear in ANY console output. JSON.stringify
    // (not join) so object-form logging — console.log(body) or a structured
    // logger.info({ body }) — is also caught, not just string concatenation.
    const allLogs = JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls.flat()));
    expect(allLogs).not.toContain("super-secret-probe-password");

    // Response must be the JSON from deploy-panel, passed through as-is.
    const body = (await res.json()) as typeof happyProbeResponse;
    expect(body.probe.suggestedMode).toBe("greenfield");
    expect(body.hostKeySha256).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");

    // Negative control: the SSH secret must not appear in the response body.
    expect(JSON.stringify(body)).not.toContain("super-secret-probe-password");

    consoleSpies.forEach((s) => s.mockRestore());
  });

  // --- Upstream non-ok ------------------------------------------------------

  it("returns a JSON error (not a throw) when deploy-panel rejects with 502", async () => {
    mockGetCredential.mockResolvedValue("dp_token");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "probe_failed", message: "SSH connection timed out" }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const res = await probeVps({ host: "1.2.3.4", sshPassword: "s" });

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    // deployRequest extracts the error message from the upstream JSON.
    expect(body.error).toBe("probe_failed");
  });

  it("returns a JSON error when deploy-panel rejects with 401", async () => {
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

    const res = await probeVps({ host: "1.2.3.4", sshPassword: "sentinel-secret-xyz" });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    // The upstream-error path must not echo the submitted SSH secret.
    expect(JSON.stringify(body)).not.toContain("sentinel-secret-xyz");
    // The response must not be a stream.
    expect(res.headers.get("Content-Type")).not.toContain("text/event-stream");
  });
});
