import { hash, compare } from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const SALT_ROUNDS = 12;

export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

// Raised when the first-account bootstrap finds an existing user inside the
// registration transaction. The route turns it into the same 403 every other
// refusal gets, so a lost race is indistinguishable from a closed door.
export const REGISTRATION_CLOSED_CODE = "registration_closed";

export class RegistrationClosedError extends AuthError {
  constructor() {
    super("Password registration is closed.", REGISTRATION_CLOSED_CODE);
  }
}

// Constant key for the transaction-scoped advisory lock that serialises
// first-account registrations (the ASCII bytes of "pilt", small enough for a
// 32-bit integer so the driver's parameter type cannot matter).
const REGISTRATION_LOCK_KEY = 0x70696c74;

// Password registration exists only as the first-account bootstrap: the User
// table must be empty. The route's early check keeps the common refusal off the
// database, but a check-then-create outside one transaction lets two concurrent
// requests both see an empty table and both create an account. The count and
// the create therefore run in one transaction behind an advisory lock: the
// second request waits for the first to commit, then counts one user and is
// refused. Hashing happens before the transaction, so the lock is held only for
// the count and the insert. This does not cover the GitHub OAuth callback,
// which creates users without taking the lock.
export async function registerUser(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Generic message to prevent account enumeration
    throw new AuthError("Registration failed. Please try again or sign in.", "registration_failed");
  }

  const passwordHash = await hash(password, SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`;
    if ((await tx.user.count()) > 0) {
      throw new RegistrationClosedError();
    }
    return tx.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  });
}

// A real bcrypt hash at the same cost as stored hashes, computed lazily on the
// first login that needs it (not at module load, so importing this module stays
// cheap). Comparing against it gives unknown and OAuth-only accounts the same
// bcrypt work as a password account. A failed computation is not cached, so a
// transient error cannot turn every later attempt into a fast rejection.
let dummyHash: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHash ??= hash(randomBytes(16).toString("hex"), SALT_ROUNDS).catch(
    (err: unknown) => {
      dummyHash = undefined;
      throw err;
    },
  );
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
