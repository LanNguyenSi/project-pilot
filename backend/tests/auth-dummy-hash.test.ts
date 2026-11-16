import { describe, it, expect, vi } from "vitest";

// Own file: the dummy hash is memoized at module level, so this needs a fresh
// module instance with a hash() that fails once.

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

vi.mock("bcryptjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bcryptjs")>();
  return {
    ...actual,
    hash: vi.fn(actual.hash),
    compare: vi.fn(actual.compare),
  };
});

import { prisma } from "../src/lib/prisma.js";
import { compare, hash } from "bcryptjs";
import { loginUser } from "../src/services/auth.js";

const mockHash = vi.mocked(hash);
const mockCompare = vi.mocked(compare);
const mockFindUnique = (prisma.user as unknown as { findUnique: ReturnType<typeof vi.fn> })
  .findUnique;

describe("loginUser dummy hash", () => {
  it("does not cache a failed dummy hash: the next attempt computes it again and pays the compare", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockHash.mockRejectedValueOnce(new Error("transient") as never);

    await expect(loginUser("nobody@example.test", "pw")).rejects.toThrow();
    expect(mockCompare).not.toHaveBeenCalled();

    await expect(loginUser("nobody@example.test", "pw")).rejects.toThrow("Invalid credentials");
    expect(mockHash).toHaveBeenCalledTimes(2);
    expect(mockCompare).toHaveBeenCalledTimes(1);
    const usedHash = mockCompare.mock.calls[0][1] as string;
    expect(usedHash).toMatch(/^\$2[aby]\$\d{2}\$/);
  }, 20_000);
});
