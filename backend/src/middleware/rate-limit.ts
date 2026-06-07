import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store. NOTE: counters are per-process only. In a multi-instance
// deployment each process keeps its own buckets, so effective limits scale with
// the number of instances. Move to a shared backend (e.g. Redis) if scaled out.
const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Resolve the client IP for rate-limiting.
 *
 * We assume deployment behind a single trusted reverse proxy (Traefik), which
 * appends the real client IP as the LAST entry of X-Forwarded-For. Trusting the
 * leftmost value would let any client spoof its identity by sending its own
 * X-Forwarded-For header, defeating the limiter entirely. When the header is
 * absent we fall back to the real TCP socket address.
 */
function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const last = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .pop();
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

function hit(key: string, max: number, windowMs: number): { limited: boolean; resetAt: number } {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  entry.count++;
  return { limited: entry.count > max, resetAt: entry.resetAt };
}

export function rateLimit(opts: {
  max: number;
  windowMs: number;
  /**
   * Optional extra identity (e.g. the submitted email) to limit on in addition
   * to the client IP. Returning undefined skips the secondary bucket. Lets an
   * account be protected against distributed brute-force from many IPs.
   */
  keyGenerator?: (c: Context) => string | undefined | Promise<string | undefined>;
}): MiddlewareHandler {
  return async (c, next) => {
    const ip = clientIp(c);
    const now = Date.now();

    // Always limit by client IP + path.
    let { limited, resetAt } = hit(`ip:${ip}:${c.req.path}`, opts.max, opts.windowMs);

    // Defense in depth: also limit by an app-supplied identity (e.g. email) so a
    // single account cannot be brute-forced from a rotating set of source IPs.
    if (!limited && opts.keyGenerator) {
      const extra = await opts.keyGenerator(c);
      if (extra) {
        const res = hit(`id:${extra}:${c.req.path}`, opts.max, opts.windowMs);
        limited = res.limited;
        if (res.resetAt > resetAt) resetAt = res.resetAt;
      }
    }

    if (limited) {
      const retryAfter = Math.ceil((resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "rate_limited", message: "Too many requests. Please try again later." },
        429,
      );
    }

    await next();
  };
}
