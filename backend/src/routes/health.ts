import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import type { AppEnv } from "../types/hono.js";

const health = new Hono<AppEnv>();

health.get("/health", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return c.json({ status: "degraded", db: "disconnected" }, 503);
  }

  // SELECT 1 only proves the connection. The User table is the table every
  // schema (prisma db push) creates: the other models reference it, so a
  // database that answers SELECT 1 without it has no schema applied (or an
  // unapplied one), which is a failed deploy, not a healthy service. Prisma
  // reports a missing table as P2021; anything else is treated as a database
  // problem, so a genuine fault never shows up as schema_missing.
  try {
    await prisma.user.findFirst({ select: { id: true } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2021") {
      return c.json({ status: "degraded", db: "schema_missing" }, 503);
    }
    return c.json({ status: "degraded", db: "disconnected" }, 503);
  }

  return c.json({ status: "ok", db: "connected" });
});

export { health };
