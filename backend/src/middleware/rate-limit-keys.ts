import type { Context } from "hono";
import type { AppEnv } from "../types/hono.js";

/**
 * Shared rateLimit keyGenerator: one extra bucket per signed-in user, on top
 * of the per-client-IP bucket the middleware always applies. Every route that
 * uses it runs requireAuth first, so the user id is in the context.
 */
export const userKey = (c: Context<AppEnv>) => `user:${c.get("userId")!}`;
