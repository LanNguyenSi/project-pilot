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

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error("Invalid credentials");
  }

  const valid = await compare(password, user.passwordHash);
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
