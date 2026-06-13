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
    fetchPrimaryVerifiedEmail: vi.fn(),
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
  fetchPrimaryVerifiedEmail,
} from "../src/services/github-oauth.js";
import { oauth } from "../src/routes/oauth.js";

const mockExchange = vi.mocked(exchangeCodeForToken);
const mockFetchUser = vi.mocked(fetchGitHubUser);
const mockFetchEmail = vi.mocked(fetchPrimaryVerifiedEmail);
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
    mockFetchEmail.mockResolvedValue("victim@example.com");
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

  it("refuses to claim an email already linked to a DIFFERENT github id (takeover guard)", async () => {
    mockExchange.mockResolvedValue({
      access_token: "gh-tok",
      token_type: "bearer",
      scope: "repo",
    });
    // Incoming GitHub identity has id "B" but the SAME verified email as a row
    // already linked to GitHub identity "A".
    mockFetchUser.mockResolvedValue({
      id: 1002, // String(1002) is the incoming githubId; differs from row's "A"
      login: "attacker",
      name: "Attacker",
      avatar_url: "",
      email: "victim@x.com",
    });
    mockFetchEmail.mockResolvedValue("victim@x.com");
    // No existing user with the incoming githubId.
    mockUser.findUnique
      .mockResolvedValueOnce(null)
      // But the email belongs to a row already linked to a DIFFERENT githubId.
      .mockResolvedValueOnce({
        id: "victim-user",
        githubId: "A",
        passwordHash: null,
        email: "victim@x.com",
      });

    const res = await callback(
      "/github/callback?code=abc&state=xyz",
      "oauth_state=xyz",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain(
      "/auth/error?reason=email_collision",
    );
    // The victim's account MUST NOT be updated — this is the security invariant.
    expect(mockUser.update).not.toHaveBeenCalled();
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("does not 500 when a githubId-matched user's verified email is owned by another row", async () => {
    // Regression: an existing githubId row is matched, but the now-verified
    // GitHub email belongs to a DIFFERENT account. The email must NOT be
    // overwritten (that would violate the unique constraint and 500); login
    // still succeeds on the matched row with its email left unchanged.
    mockExchange.mockResolvedValue({ access_token: "gh-tok", token_type: "bearer", scope: "repo" });
    mockFetchUser.mockResolvedValue({
      id: 17721800,
      login: "LanNguyenSi",
      name: "Lan",
      avatar_url: "https://gh/u",
      email: "victim@example.com",
    });
    mockFetchEmail.mockResolvedValue("victim@example.com");
    mockUser.findUnique
      // 1) githubId lookup hits the matched row (email currently null).
      .mockResolvedValueOnce({ id: "github-user", githubId: "17721800", email: null, passwordHash: null })
      // 2) the new guard looks up the email owner: a DIFFERENT row owns it.
      .mockResolvedValueOnce({ id: "local-owner", email: "victim@example.com", passwordHash: "h", githubId: null });
    mockUser.update.mockResolvedValue({ id: "github-user", githubId: "17721800" });

    const res = await callback("/github/callback?code=abc&state=xyz", "oauth_state=xyz");

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    expect(mockUser.update).toHaveBeenCalledTimes(1);
    // The colliding email was NOT written onto the matched row.
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: null }) }),
    );
  });

  it("redirects to error instead of 500 when the user upsert throws", async () => {
    mockExchange.mockResolvedValue({ access_token: "gh-tok", token_type: "bearer", scope: "repo" });
    mockFetchUser.mockResolvedValue({
      id: 42,
      login: "fresh",
      name: "Fresh",
      avatar_url: "",
      email: "same@x.com",
    });
    mockFetchEmail.mockResolvedValue("same@x.com");
    // githubId match whose email already equals the verified one (guard skipped).
    mockUser.findUnique.mockResolvedValueOnce({ id: "u1", githubId: "42", email: "same@x.com", passwordHash: null });
    mockUser.update.mockRejectedValue(new Error("unexpected unique constraint"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await callback("/github/callback?code=abc&state=xyz", "oauth_state=xyz");

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/auth/error?reason=server_error");
    // The failure must be logged, not silently swallowed.
    expect(errSpy).toHaveBeenCalledWith("OAuth user upsert failed:", expect.any(Error));
    errSpy.mockRestore();
  });

  it("persists a legitimately changed verified email for a returning github user", async () => {
    // Case (c): githubId match, verified email changed to a FREE email -> write it.
    mockExchange.mockResolvedValue({ access_token: "gh-tok", token_type: "bearer", scope: "repo" });
    mockFetchUser.mockResolvedValue({ id: 7, login: "ret", name: "Ret", avatar_url: "", email: "new@x.com" });
    mockFetchEmail.mockResolvedValue("new@x.com");
    mockUser.findUnique
      // 1) githubId match carrying an OLD email.
      .mockResolvedValueOnce({ id: "u7", githubId: "7", email: "old@x.com", passwordHash: null })
      // 2) guard email-owner lookup: the new email is unowned.
      .mockResolvedValueOnce(null);
    mockUser.update.mockResolvedValue({ id: "u7", githubId: "7" });

    const res = await callback("/github/callback?code=abc&state=xyz", "oauth_state=xyz");

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("http://localhost:3000/dashboard");
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "new@x.com" }) }),
    );
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
    mockFetchEmail.mockResolvedValue(null);
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
