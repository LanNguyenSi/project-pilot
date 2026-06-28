import { describe, it, expect, vi, beforeEach } from "vitest";

// Neutralize rate limiting — it has its own test suite; here it would cause
// flaky 429s across repeated requests within the same in-memory store window.
vi.mock("../src/middleware/rate-limit.js", () => ({
  rateLimit: () => (_c: any, next: any) => next(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { create: vi.fn(), deleteMany: vi.fn() },
    passwordReset: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any[]) => ops),
  },
}));

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
  },
  hasGitHubOAuthConfigured: false,
}));

// Mock the auth service to control token generation and hashing deterministically
// so we can assert exact DB call arguments without dealing with random values.
vi.mock("../src/services/auth.js", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  generateSessionToken: vi.fn().mockReturnValue("cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe"),
  hashToken: vi.fn().mockImplementation((t: string) => `hash_${t}`),
  hashPassword: vi.fn().mockResolvedValue("$2b$12$fakehashfakehashfakehashfakehashfakehashfakehash"),
  AuthError: class AuthError extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

// Mock requireAuth to a no-op so GET /me does not hit prisma.session
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set?.("userId", "mock-user-id");
    await next();
  }),
}));

import { prisma } from "../src/lib/prisma.js";
import {
  registerUser,
  loginUser,
  hashPassword,
} from "../src/services/auth.js";
import { auth } from "../src/routes/auth.js";

// --- Typed mock refs ---

const mockPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockPrismaSession = prisma.session as unknown as {
  create: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};
const mockPasswordReset = (prisma as any).passwordReset as {
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockTransaction = (prisma as any).$transaction as ReturnType<typeof vi.fn>;

const mockRegisterUser = vi.mocked(registerUser);
const mockLoginUser = vi.mocked(loginUser);
const mockHashPassword = vi.mocked(hashPassword);

// Fixed session token returned by the mocked generateSessionToken
const FIXED_TOKEN = "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe";
const FIXED_TOKEN_HASH = `hash_${FIXED_TOKEN}`;

// --- Helpers ---

function postJson(path: string, body: unknown, cookieHeader?: string) {
  return auth.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

// ---

describe("POST /auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with {user}, sets an HttpOnly session cookie, and creates a session", async () => {
    mockRegisterUser.mockResolvedValue({
      id: "u1",
      email: "test@test.com",
      name: null,
      createdAt: new Date(),
    });
    mockPrismaSession.create.mockResolvedValue({});

    const res = await postJson("/register", {
      email: "test@test.com",
      password: "password123",
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: object };
    expect(body).toHaveProperty("user");

    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("Set-Cookie") ?? ""];
    const sessionCookie = cookies.find((c) => c.startsWith("session="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    // CSRF-relevant: the session cookie must be SameSite=Strict.
    expect(sessionCookie).toMatch(/SameSite=Strict/i);

    expect(mockPrismaSession.create).toHaveBeenCalledOnce();
    expect(mockPrismaSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenHash: FIXED_TOKEN_HASH, userId: "u1" }),
      }),
    );
  });

  it("returns 400 when the password is too short (zod min 8)", async () => {
    const res = await postJson("/register", {
      email: "test@test.com",
      password: "short",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the email is missing", async () => {
    const res = await postJson("/register", { password: "password123" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and sets a session cookie on success", async () => {
    mockLoginUser.mockResolvedValue({ id: "u1", email: "test@test.com", name: "Test" });
    mockPrismaSession.create.mockResolvedValue({});

    const res = await postJson("/login", {
      email: "test@test.com",
      password: "password123",
    });

    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("Set-Cookie") ?? ""];
    const sessionCookie = cookies.find((c) => c.startsWith("session="));
    expect(sessionCookie).toBeDefined();
    // CSRF-relevant: the session cookie must be SameSite=Strict.
    expect(sessionCookie).toMatch(/SameSite=Strict/i);
  });

  it("returns 401 with error=invalid_credentials when the service throws", async () => {
    mockLoginUser.mockRejectedValue(new Error("Invalid credentials"));

    const res = await postJson("/login", {
      email: "test@test.com",
      password: "wrong",
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_credentials");
  });
});

describe("POST /auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the session and clears the cookie when a session cookie is present", async () => {
    mockPrismaSession.deleteMany.mockResolvedValue({ count: 1 });

    const res = await postJson("/logout", {}, `session=${FIXED_TOKEN}`);

    expect(res.status).toBe(200);
    // hashToken is called with the cookie value, then deleteMany is called with the hash
    expect(mockPrismaSession.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: FIXED_TOKEN_HASH },
    });
    // Cookie is cleared
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("Set-Cookie") ?? ""];
    const sessionCookie = cookies.find((c) => c.startsWith("session="));
    expect(sessionCookie).toMatch(/session=;|session=\s*;|Max-Age=0/i);
  });

  it("returns 200 without calling deleteMany when no session cookie is present", async () => {
    const res = await postJson("/logout", {});

    expect(res.status).toBe(200);
    expect(mockPrismaSession.deleteMany).not.toHaveBeenCalled();
  });
});

describe("POST /auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 {ok:true} for unknown email without creating a reset token (enumeration-safe)", async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);

    const res = await postJson("/forgot-password", { email: "nobody@test.com" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mockPasswordReset.create).not.toHaveBeenCalled();
  });

  it("invalidates prior tokens and creates a new reset token with expiresAt ~1 hour out", async () => {
    const userId = "u1";
    mockPrismaUser.findUnique.mockResolvedValue({ id: userId, email: "known@test.com" });
    mockPasswordReset.updateMany.mockResolvedValue({ count: 0 });
    mockPasswordReset.create.mockResolvedValue({});

    const before = Date.now();
    const res = await postJson("/forgot-password", { email: "known@test.com" });
    const after = Date.now();

    expect(res.status).toBe(200);

    // Prior tokens must be invalidated
    expect(mockPasswordReset.updateMany).toHaveBeenCalledWith({
      where: { userId, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    // New reset token created
    expect(mockPasswordReset.create).toHaveBeenCalledOnce();
    const createArg = mockPasswordReset.create.mock.calls[0][0] as {
      data: { tokenHash: string; userId: string; expiresAt: Date };
    };
    expect(createArg.data.userId).toBe(userId);
    expect(createArg.data.tokenHash).toBe(FIXED_TOKEN_HASH);

    // expiresAt should be approximately 1 hour from the time of the request
    const { expiresAt } = createArg.data;
    expect(expiresAt.getTime()).toBeGreaterThan(before + 59 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 61 * 60 * 1000);
  });
});

describe("POST /auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("success: updates password, marks token used, kills all sessions via $transaction", async () => {
    const resetRow = {
      id: "reset1",
      userId: "u1",
      tokenHash: "hash_valid-token",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
    mockPasswordReset.findFirst.mockResolvedValue(resetRow);
    mockPrismaUser.update.mockResolvedValue({});
    mockPasswordReset.update.mockResolvedValue({});
    mockPrismaSession.deleteMany.mockResolvedValue({ count: 3 });

    const res = await postJson("/reset-password", {
      token: "valid-token",
      password: "newpassword123",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // $transaction must have been called exactly once
    expect(mockTransaction).toHaveBeenCalledOnce();

    // All three ops are dispatched inside the transaction
    expect(mockPrismaUser.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "$2b$12$fakehashfakehashfakehashfakehashfakehashfakehash" },
    });
    expect(mockPasswordReset.update).toHaveBeenCalledWith({
      where: { id: "reset1" },
      data: { usedAt: expect.any(Date) },
    });
    expect(mockPrismaSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("success: findFirst where-clause includes usedAt:null and expiresAt.gt for valid token path", async () => {
    const resetRow = {
      id: "reset1",
      userId: "u1",
      tokenHash: "hash_valid-token",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
    mockPasswordReset.findFirst.mockResolvedValue(resetRow);
    mockPrismaUser.update.mockResolvedValue({});
    mockPasswordReset.update.mockResolvedValue({});
    mockPrismaSession.deleteMany.mockResolvedValue({ count: 0 });

    await postJson("/reset-password", { token: "valid-token", password: "newpassword123" });

    const findArg = mockPasswordReset.findFirst.mock.calls[0][0] as {
      where: { tokenHash: string; usedAt: null; expiresAt: { gt: Date } };
    };
    expect(findArg.where.usedAt).toBeNull();
    expect(findArg.where.expiresAt).toBeDefined();
    expect(findArg.where.expiresAt.gt).toBeInstanceOf(Date);
    // Value, not just type: the gt bound must be ~now. A `new Date(0)` mutation
    // would keep the key present (passing a type-only check) yet disable expiry.
    expect(Math.abs(findArg.where.expiresAt.gt.getTime() - Date.now())).toBeLessThan(5000);
  });

  it("invalid/expired/used token: returns 400 invalid_token and runs NO transaction or user update", async () => {
    mockPasswordReset.findFirst.mockResolvedValue(null);

    const res = await postJson("/reset-password", {
      token: "expired-token",
      password: "newpassword123",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_token");

    // No mutation must occur on invalid token
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockPrismaUser.update).not.toHaveBeenCalled();
  });

  it("invalid token: findFirst where-clause still includes usedAt:null and expiresAt.gt (filter integrity)", async () => {
    mockPasswordReset.findFirst.mockResolvedValue(null);

    await postJson("/reset-password", {
      token: "expired-token",
      password: "newpassword123",
    });

    // The handler must always apply both guards so a used/expired token cannot slip through.
    const findArg = mockPasswordReset.findFirst.mock.calls[0][0] as {
      where: { tokenHash: string; usedAt: null; expiresAt: { gt: Date } };
    };
    expect(findArg.where.usedAt).toBeNull();
    expect(findArg.where.expiresAt).toBeDefined();
    expect(findArg.where.expiresAt.gt).toBeInstanceOf(Date);
    // Value, not just type: the gt bound must be ~now. A `new Date(0)` mutation
    // would keep the key present (passing a type-only check) yet disable expiry.
    expect(Math.abs(findArg.where.expiresAt.gt.getTime() - Date.now())).toBeLessThan(5000);
  });

  it("timing-safety: hashPassword is called even when the token is invalid", async () => {
    // The route uses Promise.all([findFirst, hashPassword(...)]) to ensure the
    // password hash cost is paid regardless of token validity, preventing a
    // timing side-channel that would reveal whether a token exists.
    mockPasswordReset.findFirst.mockResolvedValue(null);

    await postJson("/reset-password", {
      token: "invalid-token",
      password: "newpassword123",
    });

    // hashPassword must be called on the invalid-token path
    expect(mockHashPassword).toHaveBeenCalledWith("newpassword123");
  });
});
