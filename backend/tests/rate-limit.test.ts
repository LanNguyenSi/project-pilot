import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../src/middleware/rate-limit.js";

function makeApp(opts: Parameters<typeof rateLimit>[0]) {
  const app = new Hono();
  app.post("/login", rateLimit(opts), (c) => c.json({ ok: true }));
  return app;
}

async function post(app: Hono, headers: Record<string, string>, body: unknown = {}) {
  return app.request("/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("rateLimit", () => {
  it("cannot be bypassed by spoofing the leftmost X-Forwarded-For hop", async () => {
    const app = makeApp({ max: 2, windowMs: 60_000 });
    // Same trusted proxy hop (rightmost), attacker rotates the spoofable leftmost value.
    const proxy = "203.0.113.9";

    const r1 = await post(app, { "x-forwarded-for": `1.1.1.1, ${proxy}` });
    const r2 = await post(app, { "x-forwarded-for": `2.2.2.2, ${proxy}` });
    const r3 = await post(app, { "x-forwarded-for": `3.3.3.3, ${proxy}` });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429); // bucket keyed on the rightmost (trusted) hop
  });

  it("keeps separate buckets per real client (rightmost) hop", async () => {
    const app = makeApp({ max: 2, windowMs: 60_000 });

    await post(app, { "x-forwarded-for": "1.1.1.1, 198.51.100.1" });
    await post(app, { "x-forwarded-for": "1.1.1.1, 198.51.100.1" });
    // Different real client: must not be limited by the first client's usage.
    const other = await post(app, { "x-forwarded-for": "1.1.1.1, 198.51.100.2" });

    expect(other.status).toBe(200);
  });

  it("also limits per submitted email across rotating IPs", async () => {
    const app = makeApp({ max: 2, windowMs: 60_000, keyGenerator: async (c) => {
      try {
        const body = (await c.req.json()) as { email?: unknown };
        return typeof body.email === "string" ? `email:${body.email.toLowerCase()}` : undefined;
      } catch {
        return undefined;
      }
    } });

    const email = { email: "victim@example.com" };
    // Each request from a distinct real client hop, but targeting the same account.
    const a = await post(app, { "x-forwarded-for": "10.0.0.1" }, email);
    const b = await post(app, { "x-forwarded-for": "10.0.0.2" }, email);
    const c = await post(app, { "x-forwarded-for": "10.0.0.3" }, email);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(429); // account-scoped bucket trips despite IP rotation
  });
});
