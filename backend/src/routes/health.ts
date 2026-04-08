import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import type { AppEnv } from "../types/hono.js";

const health = new Hono<AppEnv>();

health.get("/health", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "ok", db: "connected" });
  } catch {
    return c.json({ status: "degraded", db: "disconnected" }, 503);
  }
});

export { health };
