import type { MiddlewareHandler } from "hono";

const isProduction = process.env.NODE_ENV === "production";

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isProduction) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
};
