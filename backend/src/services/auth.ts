import { hash, compare } from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const SALT_ROUNDS = 12;

export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

export async function registerUser(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Generic message to prevent account enumeration
    throw new AuthError("Registration failed. Please try again or sign in.", "registration_failed");
  }

  const passwordHash = await hash(password, SALT_ROUNDS);

  return prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, createdAt: true },
  });
}

// A real bcrypt hash at the same cost as stored hashes, computed lazily on the
// first login that needs it (not at module load, so importing this module stays
// cheap). Comparing against it gives unknown and OAuth-only accounts the same
// bcrypt work as a password account.
let dummyHash: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHash ??= hash(randomBytes(16).toString("hex"), SALT_ROUNDS);
  return dummyHash;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Users created via GitHub OAuth have no passwordHash. Every attempt pays
  // exactly one bcrypt compare, so neither the error nor the response time
  // tells an unknown email, an OAuth-only account and a password account apart.
  const storedHash = user?.passwordHash;
  if (!user || !storedHash) {
    await compare(password, await getDummyHash());
    // The dummy compare is for timing only; its result is never a success.
    throw new Error("Invalid credentials");
  }

  const valid = await compare(password, storedHash);
  if (!valid) {
    throw new Error("Invalid credentials");
  }

  return { id: user.id, email: user.email, name: user.name };
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}
