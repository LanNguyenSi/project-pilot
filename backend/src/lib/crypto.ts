import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { config } from "../config/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // NIST recommended for GCM
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

// Upper bound for cached derivations. Every stored credential has its own salt,
// so the cache would otherwise grow with the number of credentials ever read.
export const KEY_CACHE_MAX = 256;

// Derived keys per salt, kept for decrypt only. The value is the pending
// derivation, so concurrent decrypts of one salt share a single scrypt run.
// A Map iterates in insertion order, which makes the first key the oldest.
const keyCache = new Map<string, Promise<Buffer>>();

// scrypt runs on the libuv thread pool, so the event loop keeps serving requests.
function deriveKeyUncached(salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(config.SESSION_SECRET, salt, KEY_LENGTH, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

function deriveKeyCached(salt: Buffer): Promise<Buffer> {
  const saltHex = salt.toString("hex");
  const cached = keyCache.get(saltHex);
  if (cached) return cached;

  const pending = deriveKeyUncached(salt);
  keyCache.set(saltHex, pending);
  // A failed derivation must not be served to the next caller.
  pending.catch(() => {
    if (keyCache.get(saltHex) === pending) keyCache.delete(saltHex);
  });
  while (keyCache.size > KEY_CACHE_MAX) {
    const oldest = keyCache.keys().next().value;
    if (oldest === undefined) break;
    keyCache.delete(oldest);
  }
  return pending;
}

export async function encrypt(plaintext: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  // Fresh salt per write: a cache entry could never be hit again, so skip it.
  const key = await deriveKeyUncached(salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // salt:iv:tag:ciphertext
  return `${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export async function decrypt(encoded: string): Promise<string> {
  const parts = encoded.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted format");
  }

  const [saltHex, ivHex, tagHex, ciphertext] = parts;
  const salt = Buffer.from(saltHex!, "hex");
  const key = await deriveKeyCached(salt);
  const iv = Buffer.from(ivHex!, "hex");
  const tag = Buffer.from(tagHex!, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext!, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/** Test hook: drop all cached derivations. */
export function clearKeyCache(): void {
  keyCache.clear();
}

/** Test hook: number of cached (or pending) derivations. */
export function keyCacheSize(): number {
  return keyCache.size;
}
