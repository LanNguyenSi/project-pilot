import { describe, it, expect, vi, beforeEach } from "vitest";
import { scryptSync, createCipheriv, randomBytes } from "node:crypto";

// Counts and optionally fails the real scrypt so the cache and the sharing of
// pending derivations can be observed.
const scryptControl = vi.hoisted(() => ({ calls: 0, failNext: false }));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    scrypt: ((...args: Parameters<typeof actual.scrypt>) => {
      scryptControl.calls++;
      if (scryptControl.failNext) {
        scryptControl.failNext = false;
        const cb = args[args.length - 1] as (err: Error | null, key?: Buffer) => void;
        setImmediate(() => cb(new Error("scrypt failed")));
        return;
      }
      return (actual.scrypt as (...a: unknown[]) => void)(...args);
    }) as typeof actual.scrypt,
  };
});

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
  },
  hasGitHubOAuthConfigured: false,
}));

import { encrypt, decrypt, clearKeyCache, keyCacheSize, KEY_CACHE_MAX } from "../src/lib/crypto.js";

describe("crypto (AES-256-GCM)", () => {
  describe("round-trip", () => {
    it("decrypts a normal string back to the original", async () => {
      const s = "hello world";
      expect(await decrypt(await encrypt(s))).toBe(s);
    });

    it("decrypts an empty string", async () => {
      const s = "";
      expect(await decrypt(await encrypt(s))).toBe(s);
    });

    it("decrypts a unicode and long string", async () => {
      const s = "こんにちは world! 😀 " + "x".repeat(500);
      expect(await decrypt(await encrypt(s))).toBe(s);
    });
  });

  describe("format", () => {
    it("returns exactly 4 colon-separated parts", async () => {
      const parts = (await encrypt("test")).split(":");
      expect(parts).toHaveLength(4);
    });

    it("salt part is 32 hex chars (16 bytes)", async () => {
      const [salt] = (await encrypt("test")).split(":");
      expect(salt).toHaveLength(32);
      expect(salt).toMatch(/^[0-9a-f]+$/);
    });

    it("iv part is 24 hex chars (12 bytes)", async () => {
      const [, iv] = (await encrypt("test")).split(":");
      expect(iv).toHaveLength(24);
      expect(iv).toMatch(/^[0-9a-f]+$/);
    });

    it("tag and ciphertext parts are valid hex", async () => {
      const [, , tag, ciphertext] = (await encrypt("test data")).split(":");
      expect(tag).toMatch(/^[0-9a-f]+$/);
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("non-determinism", () => {
    it("two encryptions of the same input produce different ciphertexts", async () => {
      const s = "same input string";
      const a = await encrypt(s);
      const b = await encrypt(s);
      expect(a).not.toBe(b);
    });

    it("both ciphertexts decrypt back to the original", async () => {
      const s = "same input string";
      const a = await encrypt(s);
      const b = await encrypt(s);
      expect(await decrypt(a)).toBe(s);
      expect(await decrypt(b)).toBe(s);
    });
  });

  describe("guard: invalid format throws", () => {
    it('throws "Invalid encrypted format" for 3-part input', async () => {
      await expect(decrypt("only:three:parts")).rejects.toThrow("Invalid encrypted format");
    });

    it('throws "Invalid encrypted format" for 5-part input (a:b:c:d:e)', async () => {
      await expect(decrypt("a:b:c:d:e")).rejects.toThrow("Invalid encrypted format");
    });

    it('throws "Invalid encrypted format" for input with no colons', async () => {
      await expect(decrypt("noparts")).rejects.toThrow("Invalid encrypted format");
    });
  });

  describe("auth-tag tamper rejection (GCM integrity)", () => {
    it("throws when the auth tag segment is tampered", async () => {
      const enc = await encrypt("secret data");
      const parts = enc.split(":");
      // Flip the last byte of the auth tag — any 1-bit change invalidates GCM.
      const tag = parts[2]!;
      const lastByte = tag.slice(-2);
      parts[2] = tag.slice(0, -2) + (lastByte === "ff" ? "00" : "ff");
      // Specifically a GCM integrity failure, not any incidental throw (the
      // message is "unable to authenticate data" or, on newer OpenSSL, "bad decrypt").
      await expect(decrypt(parts.join(":"))).rejects.toThrow(/authenticate|bad decrypt/i);
    });

    it("throws when the ciphertext segment is tampered", async () => {
      // Use a non-empty plaintext so the ciphertext segment is non-empty.
      const enc = await encrypt("secret data that is long enough");
      const parts = enc.split(":");
      const ct = parts[3]!;
      const lastByte = ct.slice(-2);
      parts[3] = ct.slice(0, -2) + (lastByte === "ff" ? "00" : "ff");
      // Specifically a GCM integrity failure, not any incidental throw (the
      // message is "unable to authenticate data" or, on newer OpenSSL, "bad decrypt").
      await expect(decrypt(parts.join(":"))).rejects.toThrow(/authenticate|bad decrypt/i);
    });
  });

  describe("compatibility with ciphertexts from the synchronous implementation", () => {
    it("decrypts a value produced with scryptSync and the same format", async () => {
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const key = scryptSync("test-session-secret-must-be-32chars!!", salt, 32);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = cipher.update("legacy-token", "utf8", "hex") + cipher.final("hex");
      const legacy = [salt, iv, cipher.getAuthTag()].map((b) => b.toString("hex")).join(":") + ":" + body;
      await expect(decrypt(legacy)).resolves.toBe("legacy-token");
    });

    it("decrypts a fixed fixture written by the synchronous implementation", async () => {
      const fixture =
        "00112233445566778899aabbccddeeff:aabbccddeeff001122334455:" +
        (() => {
          const key = scryptSync("test-session-secret-must-be-32chars!!", Buffer.from("00112233445566778899aabbccddeeff", "hex"), 32);
          const c = createCipheriv("aes-256-gcm", key, Buffer.from("aabbccddeeff001122334455", "hex"));
          const ct = c.update("fixed", "utf8", "hex") + c.final("hex");
          return `${c.getAuthTag().toString("hex")}:${ct}`;
        })();
      await expect(decrypt(fixture)).resolves.toBe("fixed");
    });
  });

  describe("key cache", () => {
    beforeEach(() => {
      clearKeyCache();
      scryptControl.calls = 0;
      scryptControl.failNext = false;
    });

    it("does not fill the cache on encrypt", async () => {
      await encrypt("a");
      expect(keyCacheSize()).toBe(0);
    });

    it("reuses the derived key for repeated decrypts of one ciphertext", async () => {
      const enc = await encrypt("a");
      scryptControl.calls = 0;
      await decrypt(enc);
      await decrypt(enc);
      expect(scryptControl.calls).toBe(1);
    });

    it("shares one derivation between concurrent decrypts of the same salt", async () => {
      const enc = await encrypt("shared");
      scryptControl.calls = 0;
      const results = await Promise.all([decrypt(enc), decrypt(enc), decrypt(enc)]);
      expect(results).toEqual(["shared", "shared", "shared"]);
      expect(scryptControl.calls).toBe(1);
    });

    it("evicts the oldest entry once the bound is exceeded", async () => {
      const first = await encrypt("first");
      await decrypt(first);
      const fillers = await Promise.all(
        Array.from({ length: KEY_CACHE_MAX }, (_, i) => encrypt(`filler-${i}`)),
      );
      await Promise.all(fillers.map((f) => decrypt(f)));
      expect(keyCacheSize()).toBe(KEY_CACHE_MAX);
      scryptControl.calls = 0;
      await decrypt(first); // evicted, so it derives again
      expect(scryptControl.calls).toBe(1);
      expect(keyCacheSize()).toBe(KEY_CACHE_MAX);
    }, 30_000);

    it("does not cache a rejected derivation", async () => {
      const enc = await encrypt("retry");
      clearKeyCache();
      scryptControl.calls = 0;
      scryptControl.failNext = true;
      await expect(decrypt(enc)).rejects.toThrow("scrypt failed");
      expect(keyCacheSize()).toBe(0);
      await expect(decrypt(enc)).resolves.toBe("retry");
      expect(scryptControl.calls).toBe(2);
    });
  });
});
