import { describe, it, expect, vi } from "vitest";

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
  },
  hasGitHubOAuthConfigured: false,
}));

import { encrypt, decrypt } from "../src/lib/crypto.js";

describe("crypto (AES-256-GCM)", () => {
  describe("round-trip", () => {
    it("decrypts a normal string back to the original", () => {
      const s = "hello world";
      expect(decrypt(encrypt(s))).toBe(s);
    });

    it("decrypts an empty string", () => {
      const s = "";
      expect(decrypt(encrypt(s))).toBe(s);
    });

    it("decrypts a unicode and long string", () => {
      const s = "こんにちは world! 😀 " + "x".repeat(500);
      expect(decrypt(encrypt(s))).toBe(s);
    });
  });

  describe("format", () => {
    it("returns exactly 4 colon-separated parts", () => {
      const parts = encrypt("test").split(":");
      expect(parts).toHaveLength(4);
    });

    it("salt part is 32 hex chars (16 bytes)", () => {
      const [salt] = encrypt("test").split(":");
      expect(salt).toHaveLength(32);
      expect(salt).toMatch(/^[0-9a-f]+$/);
    });

    it("iv part is 24 hex chars (12 bytes)", () => {
      const [, iv] = encrypt("test").split(":");
      expect(iv).toHaveLength(24);
      expect(iv).toMatch(/^[0-9a-f]+$/);
    });

    it("tag and ciphertext parts are valid hex", () => {
      const [, , tag, ciphertext] = encrypt("test data").split(":");
      expect(tag).toMatch(/^[0-9a-f]+$/);
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("non-determinism", () => {
    it("two encryptions of the same input produce different ciphertexts", () => {
      const s = "same input string";
      const a = encrypt(s);
      const b = encrypt(s);
      expect(a).not.toBe(b);
    });

    it("both ciphertexts decrypt back to the original", () => {
      const s = "same input string";
      const a = encrypt(s);
      const b = encrypt(s);
      expect(decrypt(a)).toBe(s);
      expect(decrypt(b)).toBe(s);
    });
  });

  describe("guard: invalid format throws", () => {
    it('throws "Invalid encrypted format" for 3-part input', () => {
      expect(() => decrypt("only:three:parts")).toThrow("Invalid encrypted format");
    });

    it('throws "Invalid encrypted format" for 5-part input (a:b:c:d:e)', () => {
      expect(() => decrypt("a:b:c:d:e")).toThrow("Invalid encrypted format");
    });

    it('throws "Invalid encrypted format" for input with no colons', () => {
      expect(() => decrypt("noparts")).toThrow("Invalid encrypted format");
    });
  });

  describe("auth-tag tamper rejection (GCM integrity)", () => {
    it("throws when the auth tag segment is tampered", () => {
      const enc = encrypt("secret data");
      const parts = enc.split(":");
      // Flip the last byte of the auth tag — any 1-bit change invalidates GCM.
      const tag = parts[2]!;
      const lastByte = tag.slice(-2);
      parts[2] = tag.slice(0, -2) + (lastByte === "ff" ? "00" : "ff");
      // Specifically a GCM integrity failure, not any incidental throw.
      expect(() => decrypt(parts.join(":"))).toThrow(/authenticate/i);
    });

    it("throws when the ciphertext segment is tampered", () => {
      // Use a non-empty plaintext so the ciphertext segment is non-empty.
      const enc = encrypt("secret data that is long enough");
      const parts = enc.split(":");
      const ct = parts[3]!;
      const lastByte = ct.slice(-2);
      parts[3] = ct.slice(0, -2) + (lastByte === "ff" ? "00" : "ff");
      // Specifically a GCM integrity failure, not any incidental throw.
      expect(() => decrypt(parts.join(":"))).toThrow(/authenticate/i);
    });
  });
});
