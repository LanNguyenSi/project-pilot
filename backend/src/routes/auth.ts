import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { registerUser, loginUser, generateSessionToken, hashToken } from "../services/auth.js";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types/hono.js";

const auth = new Hono<AppEnv>();

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
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

// POST /auth/register
auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, password, name } = c.req.valid("json");

  try {
    const user = await registerUser(email, password, name);
    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ user }, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Registration failed";
    return c.json({ error: "registration_failed", message }, 400);
  }
});

// POST /auth/login
auth.post("/login", zValidator("json", loginSchema), async (c) => {
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
  deleteCookie(c, "session");
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

export { auth };
