import { Hono } from "hono";
import type { Context, Next } from "hono";
import { z } from "zod";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { registerUser, loginUser, generateSessionToken, hashToken, hashPassword } from "../services/auth.js";
import { zValidate } from "../lib/validate.js";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import type { AppEnv } from "../types/hono.js";

const auth = new Hono<AppEnv>();

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// Defense-in-depth rate-limit key: scope brute-force limits to the submitted
// email (normalized) so a single account can't be hammered from rotating IPs.
// Reads the cached request body, so it does not consume the stream that the
// downstream zValidator parses. Returns undefined on malformed/absent bodies.
async function emailKey(c: Context): Promise<string | undefined> {
  try {
    const body = (await c.req.json()) as { email?: unknown };
    return typeof body.email === "string" ? `email:${body.email.toLowerCase().trim()}` : undefined;
  } catch {
    return undefined;
  }
}

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, "session", token, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await prisma.session.create({
    data: { tokenHash, userId, expiresAt },
  });

  return token;
}

// Password sign-up is closed: there is no mail verification, so an open route
// lets anyone claim an address first and block that person's GitHub sign-in.
// The only way in is the first-account bootstrap, which needs the explicit
// ALLOW_FIRST_PASSWORD_ACCOUNT opt-in and an empty User table. Every refusal
// is the same 403 body, so the answer says nothing about existing accounts.
const registrationClosed = {
  error: "registration_closed",
  message: "Password registration is closed. Sign in with GitHub.",
} as const;

// Matches the service's closed error by its code rather than its class, so the
// route needs no import beyond the ones it already has.
function isRegistrationClosed(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "registration_closed";
}

async function requireRegistrationOpen(c: Context, next: Next) {
  if (!config.ALLOW_FIRST_PASSWORD_ACCOUNT) {
    return c.json(registrationClosed, 403);
  }
  if ((await prisma.user.count()) > 0) {
    return c.json(registrationClosed, 403);
  }
  await next();
}

// POST /auth/register: 5 attempts per minute, closed except for the bootstrap
auth.post("/register", rateLimit({ max: 5, windowMs: 60_000 }), requireRegistrationOpen, zValidate("json", registerSchema), async (c) => {
  const { email, password, name } = c.req.valid("json");

  try {
    const user = await registerUser(email, password, name);
    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ user }, 201);
  } catch (err) {
    // Another bootstrap registration won the race: same body as every refusal.
    if (isRegistrationClosed(err)) {
      return c.json(registrationClosed, 403);
    }
    return c.json({ error: "registration_failed", message: "Registration failed. Please try again or sign in." }, 400);
  }
});

// POST /auth/login — 10 attempts per minute
auth.post("/login", rateLimit({ max: 10, windowMs: 60_000, keyGenerator: emailKey }), zValidate("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  try {
    const user = await loginUser(email, password);
    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ user });
  } catch {
    return c.json({ error: "invalid_credentials", message: "Invalid email or password" }, 401);
  }
});

// POST /auth/logout
auth.post("/logout", async (c) => {
  const sessionToken = getCookie(c, "session");
  if (sessionToken) {
    const tokenHash = hashToken(sessionToken);
    await prisma.session.deleteMany({ where: { tokenHash } });
  }
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

// GET /auth/me
auth.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return c.json({ user });
});

// POST /auth/forgot-password
const forgotSchema = z.object({ email: z.email() });

// Timing enumeration defense: the user lookup, the invalidation of prior
// tokens and the token creation all live here, and this runs only after the
// response has been produced (the route schedules it with setImmediate). The
// request path therefore does no database work at all, so a known and an
// unknown email trigger the exact same observable work before the answer.
async function issuePasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Unknown email: nothing to invalidate and no token to create. The caller
  // already answered {ok:true}, so this stays silent either way.
  if (!user) {
    return;
  }

  // Invalidate existing reset tokens
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordReset.create({
    data: { tokenHash, userId: user.id, expiresAt },
  });

  // TODO: send email via notification-service. No delivery path exists yet: only the token hash is stored, so the token is never delivered or recoverable.
  // Issuance is best effort: it runs after the response, so it is lost if the
  // process exits right after answering. It must become a durable queue when
  // mail delivery lands.
}

auth.post("/forgot-password", rateLimit({ max: 3, windowMs: 60_000, keyGenerator: emailKey }), zValidate("json", forgotSchema), async (c) => {
  const { email } = c.req.valid("json");

  // The email is handed to issuePasswordReset after the response; the .catch
  // keeps a database failure from becoming an unhandled rejection, and it is
  // logged because the answer (always {ok:true}) cannot surface it. Only the
  // error name and a Prisma error code are logged: a Prisma error message can
  // embed the query arguments (the submitted email, token hash, user id).
  const scheduleIssuance = () => {
    issuePasswordReset(email).catch((err: unknown) => {
      const name = err instanceof Error ? err.name : "UnknownError";
      const code = typeof (err as { code?: unknown } | null)?.code === "string" ? (err as { code: string }).code : undefined;
      console.error("[auth] forgot-password issuance failed:", name, ...(code ? [code] : []));
    });
  };
  setImmediate(scheduleIssuance);

  return c.json({ ok: true });
});

// POST /auth/reset-password
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

auth.post("/reset-password", rateLimit({ max: 5, windowMs: 60_000 }), zValidate("json", resetSchema), async (c) => {
  const { token, password } = c.req.valid("json");
  const tokenHash = hashToken(token);

  // Always hash the password to prevent timing attacks that reveal token validity
  const [reset, passwordHash] = await Promise.all([
    prisma.passwordReset.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    }),
    hashPassword(password),
  ]);

  if (!reset) {
    return c.json({ error: "invalid_token", message: "Invalid or expired reset link" }, 400);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: reset.userId } }),
  ]);

  return c.json({ ok: true });
});

// GET /auth/sessions: how many unexpired sessions the account has.
auth.get("/sessions", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const active = await prisma.session.count({
    where: { userId, expiresAt: { gt: new Date() } },
  });
  return c.json({ active, current: true });
});

// POST /auth/sessions/revoke-others: end every session of the account except
// the one that sent this request.
auth.post("/sessions/revoke-others", requireAuth, async (c) => {
  const userId = c.get("userId")!;
  const tokenHash = hashToken(getCookie(c, "session") ?? "");
  const { count } = await prisma.session.deleteMany({
    where: { userId, tokenHash: { not: tokenHash } },
  });
  return c.json({ ok: true, revoked: count });
});

export { auth };
