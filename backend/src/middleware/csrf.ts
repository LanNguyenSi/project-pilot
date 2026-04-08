import type { MiddlewareHandler } from "hono";

/**
 * CSRF protection via custom header check.
 * Browsers won't send custom headers in cross-origin simple requests.
 * Combined with SameSite=Strict cookies, this provides double protection.
 */
export const csrfProtection: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;

  // Safe methods don't need CSRF protection
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  const requested = c.req.header("x-requested-with");
  if (requested !== "XMLHttpRequest") {
    return c.json(
      { error: "csrf_failed", message: "Missing X-Requested-With header" },
      403,
    );
  }

  await next();
};
