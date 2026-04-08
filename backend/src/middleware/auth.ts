import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { prisma } from "../lib/prisma.js";
import { hashToken } from "../services/auth.js";
import type { AppEnv } from "../types/hono.js";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionToken = getCookie(c, "session");

  if (!sessionToken) {
    return c.json({ error: "unauthorized", message: "Not authenticated" }, 401);
  }

  const tokenHash = hashToken(sessionToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return c.json({ error: "unauthorized", message: "Session expired" }, 401);
  }

  c.set("userId", session.user.id);
  await next();
};
