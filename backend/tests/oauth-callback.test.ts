import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    session: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("../src/services/github-oauth.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/services/github-oauth.js")
  >("../src/services/github-oauth.js");
  return {
    ...actual,
    exchangeCodeForToken: vi.fn(),
    fetchGitHubUser: vi.fn(),
  };
});

vi.mock("../src/services/module-registration.js", () => ({
  registerUserWithAllModules: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    GITHUB_CLIENT_ID: "test-id",
    GITHUB_CLIENT_SECRET: "test-secret",
  },
  hasGitHubOAuthConfigured: true,
}));

import { prisma } from "../src/lib/prisma.js";
import {
  exchangeCodeForToken,
  fetchGitHubUser,
} from "../src/services/github-oauth.js";
import { oauth } from "../src/routes/oauth.js";

const mockExchange = vi.mocked(exchangeCodeForToken);
const mockFetchUser = vi.mocked(fetchGitHubUser);
const mockUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

async function callback(url: string, cookieHeader?: string): Promise<Response> {
  return oauth.request(url, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
}

describe("GET /oauth/github/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to error page when state cookie is missing", async () => {
    const res = await callback("/github/callback?code=abc&state=xyz");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/auth/error?reason=state_mismatch");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("redirects to error page when state mismatches", async () => {
    const res = await callback(
      "/github/callback?code=abc&state=xyz",
      "oauth_state=different-value",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/auth/error?reason=state_mismatch");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("redirects to error page when code param is missing", async () => {
    const res = await callback(
      "/github/callback?state=xyz",
      "oauth_state=xyz",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/auth/error?reason=missing_code");
  });

  it("refuses to auto-link when a local-auth user owns the email (collision guard)", async () => {
    mockExchange.mockResolvedValue({
      access_token: "gh-tok",
      token_type: "bearer",
      scope: "repo",
    });
    mockFetchUser.mockResolvedValue({
      id: 999,
      login: "attacker-or-user",
      name: "X",
      avatar_url: "",
      email: "victim@example.com",
    });
    // No existing user with this githubId.
    mockUser.findUnique
      .mockResolvedValueOnce(null)
      // But a local user with this email (passwordHash set, no githubId) exists.
      .mockResolvedValueOnce({
        id: "local-user",
        email: "victim@example.com",
        passwordHash: "hashed",
        githubId: null,
      });

    const res = await callback(
      "/github/callback?code=abc&state=xyz",
      "oauth_state=xyz",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/auth/error?reason=email_collision");
    // The account MUST NOT be updated — this is the security invariant.
    expect(mockUser.update).not.toHaveBeenCalled();
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("creates a new user and signs them in on a clean first-login", async () => {
    mockExchange.mockResolvedValue({
      access_token: "gh-tok",
      token_type: "bearer",
      scope: "repo",
    });
    mockFetchUser.mockResolvedValue({
      id: 42,
      login: "fresh",
      name: "Fresh User",
      avatar_url: "https://gh/u",
      email: null,
    });
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({
      id: "new-user",
      githubId: "42",
      githubLogin: "fresh",
    });

    const res = await callback(
      "/github/callback?code=abc&state=xyz",
      "oauth_state=xyz",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    expect(mockUser.create).toHaveBeenCalledTimes(1);
    // Session cookie is set with SameSite=Lax (must survive the OAuth
    // cross-site redirect dance).
    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("Set-Cookie") ?? ""];
    const sessionCookie = setCookies.find((c) => c.startsWith("session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });
});
