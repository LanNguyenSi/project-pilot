import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    session: { create: vi.fn() },
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

// Wrap bcrypt.compare in a call-through spy so real hashing/verification
// behavior is preserved, while we can assert compare is NOT reached on the
// OAuth-only (null passwordHash) login path. spyOn cannot patch this ESM
// named export, so the module is partially mocked instead.
vi.mock("bcryptjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bcryptjs")>();
  return { ...actual, compare: vi.fn(actual.compare) };
});

import { prisma } from "../src/lib/prisma.js";
import { compare } from "bcryptjs";
import {
  registerUser,
  loginUser,
  generateSessionToken,
  hashToken,
  hashPassword,
  AuthError,
} from "../src/services/auth.js";

const mockCompare = vi.mocked(compare);

const mockUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerUser", () => {
    it("creates a user and returns the selected fields when email is new", async () => {
      mockUser.findUnique.mockResolvedValue(null);
      const createdAt = new Date();
      mockUser.create.mockResolvedValue({
        id: "u1",
        email: "new@test.com",
        name: null,
        createdAt,
      });

      const result = await registerUser("new@test.com", "password123");

      expect(mockUser.create).toHaveBeenCalledOnce();
      // Verify the stored hash is a real bcrypt hash of the plaintext password
      const createArg = mockUser.create.mock.calls[0][0] as {
        data: { email: string; passwordHash: string; name?: string };
        select: object;
      };
      expect(createArg.data.passwordHash).toMatch(/^\$2/);
      expect(await compare("password123", createArg.data.passwordHash)).toBe(true);
      expect(result).toEqual(
        expect.objectContaining({ id: "u1", email: "new@test.com" }),
      );
    });

    it("throws AuthError with code=registration_failed when email is already taken", async () => {
      mockUser.findUnique.mockResolvedValue({ id: "existing", email: "taken@test.com" });

      let caughtError: unknown;
      try {
        await registerUser("taken@test.com", "password123");
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(AuthError);
      expect((caughtError as AuthError).code).toBe("registration_failed");
      // create must not be called when the user already exists
      expect(mockUser.create).not.toHaveBeenCalled();
    });
  });

  describe("loginUser", () => {
    it("returns {id, email, name} on successful login with correct password", async () => {
      const realHash = await hashPassword("correct-horse");
      mockUser.findUnique.mockResolvedValue({
        id: "u1",
        email: "user@test.com",
        name: "Alice",
        passwordHash: realHash,
      });

      const result = await loginUser("user@test.com", "correct-horse");

      expect(result).toEqual({ id: "u1", email: "user@test.com", name: "Alice" });
    });

    const costOf = (h: string) => h.split("$")[2];

    it("OAuth-only user: one compare against a dummy hash, same error as a wrong password", async () => {
      mockUser.findUnique.mockResolvedValue({
        id: "u2",
        email: "oauth@test.com",
        name: "Bob",
        passwordHash: null,
      });
      await expect(loginUser("oauth@test.com", "anyPassword")).rejects.toThrow(
        "Invalid credentials",
      );

      // One compare per attempt keeps the bcrypt work equal to a password account.
      expect(mockCompare).toHaveBeenCalledTimes(1);
      const [pw, usedHash] = mockCompare.mock.calls[0] as [string, string];
      expect(pw).toBe("anyPassword");
      expect(usedHash).toMatch(/^\$2[aby]\$\d\d\$/);
    });

    it("unknown email: one compare against a dummy hash, same error as a wrong password", async () => {
      mockUser.findUnique.mockResolvedValue(null);

      await expect(loginUser("unknown@test.com", "password123")).rejects.toThrow(
        "Invalid credentials",
      );

      expect(mockCompare).toHaveBeenCalledTimes(1);
      expect(mockCompare.mock.calls[0][0]).toBe("password123");
    });

    it("the dummy hash has the same cost factor as a stored password hash", async () => {
      const stored = await hashPassword("whatever-password");
      mockCompare.mockClear();
      mockUser.findUnique.mockResolvedValue(null);
      await expect(loginUser("unknown@test.com", "x")).rejects.toThrow("Invalid credentials");

      const usedHash = mockCompare.mock.calls[0][1] as string;
      expect(costOf(usedHash)).toBe(costOf(stored));
    });

    it("the dummy path never succeeds, even if compare resolves true", async () => {
      mockCompare.mockResolvedValueOnce(true as never);
      mockUser.findUnique.mockResolvedValue(null);
      await expect(loginUser("unknown@test.com", "pw")).rejects.toThrow("Invalid credentials");

      mockCompare.mockResolvedValueOnce(true as never);
      mockUser.findUnique.mockResolvedValue({
        id: "u2",
        email: "oauth@test.com",
        name: "Bob",
        passwordHash: null,
      });
      await expect(loginUser("oauth@test.com", "pw")).rejects.toThrow("Invalid credentials");
    });

    it("a password account pays exactly one compare against its own hash", async () => {
      const realHash = await hashPassword("right-password");
      mockCompare.mockClear();
      mockUser.findUnique.mockResolvedValue({
        id: "u3",
        email: "user@test.com",
        name: "Charlie",
        passwordHash: realHash,
      });
      await expect(loginUser("user@test.com", "wrong-password")).rejects.toThrow(
        "Invalid credentials",
      );
      expect(mockCompare).toHaveBeenCalledTimes(1);
      expect(mockCompare.mock.calls[0][1]).toBe(realHash);
    });

    it("throws 'Invalid credentials' on wrong password", async () => {
      const realHash = await hashPassword("right-password");
      mockUser.findUnique.mockResolvedValue({
        id: "u3",
        email: "user@test.com",
        name: "Charlie",
        passwordHash: realHash,
      });

      await expect(loginUser("user@test.com", "wrong-password")).rejects.toThrow(
        "Invalid credentials",
      );
    });
  });

  describe("generateSessionToken", () => {
    it("returns a 64-character lowercase hex string", () => {
      const token = generateSessionToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it("returns different tokens on successive calls (random)", () => {
      const a = generateSessionToken();
      const b = generateSessionToken();
      expect(a).not.toBe(b);
    });
  });

  describe("hashToken", () => {
    it("returns a deterministic sha256 hex hash matching node crypto output", () => {
      const expected = createHash("sha256").update("abc").digest("hex");
      expect(hashToken("abc")).toBe(expected);
    });

    it("returns a different hash for different inputs", () => {
      expect(hashToken("a")).not.toBe(hashToken("b"));
    });
  });
});
