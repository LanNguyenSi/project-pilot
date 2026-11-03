import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { user: {}, session: {} },
}));
vi.mock("../src/services/module-registration.js", () => ({
  registerUserWithAllModules: vi.fn(),
}));

/**
 * GET /api/oauth/config and the unconfigured /github/start redirect, driven by
 * the real config module (not a mock) so the predicate under test is the one
 * production uses. Each env combination is its own case. Rule: GitHub OAuth is
 * configured only when BOTH GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are
 * non-empty; an empty string counts as unset.
 */
async function loadOauth(env: Record<string, string> = {}) {
  const saved = { ...process.env };
  try {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    process.env.DATABASE_URL = "postgresql://test";
    process.env.SESSION_SECRET = "test-session-secret-must-be-32chars!!";
    process.env.FRONTEND_URL = "http://localhost:3000";
    Object.assign(process.env, env);
    vi.resetModules();
    const mod = await import("../src/routes/oauth.js");
    return mod.oauth;
  } finally {
    process.env = saved;
  }
}

describe("GET /config", () => {
  afterEach(() => vi.resetModules());

  const cases: Array<[string, Record<string, string>, boolean]> = [
    ["both unset", {}, false],
    ["both set", { GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" }, true],
    ["only the client id set", { GITHUB_CLIENT_ID: "id" }, false],
    ["only the client secret set", { GITHUB_CLIENT_SECRET: "secret" }, false],
    ["both empty strings", { GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" }, false],
    ["id set, secret empty", { GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "" }, false],
  ];

  for (const [name, env, expected] of cases) {
    it(`${name} -> github: ${expected}`, async () => {
      const oauth = await loadOauth(env);
      const res = await oauth.request("/config");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ github: expected });
    });
  }

  it("reveals nothing but the boolean and is not cacheable", async () => {
    const oauth = await loadOauth({
      GITHUB_CLIENT_ID: "super-client-id",
      GITHUB_CLIENT_SECRET: "super-client-secret",
    });
    const res = await oauth.request("/config");
    const text = await res.text();
    expect(text).not.toContain("super-client");
    expect(text).not.toContain("callback");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /github/start when unconfigured", () => {
  afterEach(() => vi.resetModules());

  it("redirects to the frontend error page instead of raw JSON", async () => {
    const oauth = await loadOauth({});
    const res = await oauth.request("/github/start");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/auth/error?reason=not_configured",
    );
  });

  it("redirects when only one of the two values is set", async () => {
    const oauth = await loadOauth({ GITHUB_CLIENT_ID: "id" });
    const res = await oauth.request("/github/start");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/auth/error?reason=not_configured");
  });

  it("still goes to GitHub when configured", async () => {
    const oauth = await loadOauth({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" });
    const res = await oauth.request("/github/start");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("github.com/login/oauth/authorize");
  });
});
