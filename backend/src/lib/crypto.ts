import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // NIST recommended for GCM
const SALT_LENGTH = 16;

// Cache derived keys per salt to avoid blocking event loop repeatedly
const keyCache = new Map<string, Buffer>();

function deriveKey(salt: Buffer): Buffer {
  const saltHex = salt.toString("hex");
  let key = keyCache.get(saltHex);
  if (!key) {
    key = scryptSync(config.SESSION_SECRET, salt, 32);
    keyCache.set(saltHex, key);
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // salt:iv:tag:ciphertext
  return `${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted format");
  }

  const [saltHex, ivHex, tagHex, ciphertext] = parts;
  const salt = Buffer.from(saltHex!, "hex");
  const key = deriveKey(salt);
  const iv = Buffer.from(ivHex!, "hex");
  const tag = Buffer.from(tagHex!, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext!, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
