import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "../src/middleware/rate-limit.js";
import { userKey } from "../src/middleware/rate-limit-keys.js";

function makeApp(opts: Parameters<typeof rateLimit>[0]) {
  const app = new Hono();
  app.post("/login", rateLimit(opts), (c) => c.json({ ok: true }));
  return app;
}

// One limiter instance registered on several paths, so a test can tell
// whether the bucket keys are per path or shared across paths.
function makeMultiPathApp(opts: Parameters<typeof rateLimit>[0], paths: string[]) {
  const app = new Hono();
  const mw = rateLimit(opts);
  for (const path of paths) app.post(path, mw, (c) => c.json({ ok: true }));
  return app;
}

async function post(
  app: Hono,
  headers: Record<string, string>,
  body: unknown = {},
  path = "/login",
) {
  return app.request(path, {
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

  it("with bucket set, one client-IP bucket is shared across paths", async () => {
    // No keyGenerator: only the IP bucket can produce the 429, so a 429 on
    // the third path proves the bucket name replaced the path in the IP key.
    const app = makeMultiPathApp({ max: 2, windowMs: 60_000, bucket: "fixed-bucket" }, ["/a", "/b", "/c"]);
    const ip = { "x-forwarded-for": "192.0.2.11" };

    expect((await post(app, ip, {}, "/a")).status).toBe(200);
    expect((await post(app, ip, {}, "/b")).status).toBe(200);
    expect((await post(app, ip, {}, "/c")).status).toBe(429);
  });

  it("with bucket set, one identity bucket is shared across paths", async () => {
    // A fresh address per call: no IP bucket can fill up, so only the
    // identity bucket can produce the 429 across three different paths.
    const app = makeMultiPathApp(
      { max: 2, windowMs: 60_000, keyGenerator: () => "user:bucketed", bucket: "fixed-bucket" },
      ["/a", "/b", "/c"],
    );

    expect((await post(app, { "x-forwarded-for": "192.0.2.21" }, {}, "/a")).status).toBe(200);
    expect((await post(app, { "x-forwarded-for": "192.0.2.22" }, {}, "/b")).status).toBe(200);
    expect((await post(app, { "x-forwarded-for": "192.0.2.23" }, {}, "/c")).status).toBe(429);
  });

  it("with bucket set, two different identities keep separate buckets", async () => {
    const app = makeMultiPathApp(
      { max: 2, windowMs: 60_000, keyGenerator: (c) => (c.req.header("x-identity") ?? undefined), bucket: "fixed-bucket" },
      ["/a"],
    );
    const who = (n: number, name: string) => ({
      "x-forwarded-for": `192.0.2.${100 + n}`,
      "x-identity": name,
    });

    expect((await post(app, who(1, "user:one"), {}, "/a")).status).toBe(200);
    expect((await post(app, who(2, "user:one"), {}, "/a")).status).toBe(200);
    expect((await post(app, who(3, "user:one"), {}, "/a")).status).toBe(429);
    // A different identity on the same path and bucket: untouched quota.
    expect((await post(app, who(4, "user:other"), {}, "/a")).status).toBe(200);
  });

  it("without bucket, the keys stay per path: one identity on three paths is not shared", async () => {
    // Same identity, three different paths, fresh addresses: with the bucket
    // option wrongly applied by default the third call would be 429 here.
    const app = makeMultiPathApp(
      { max: 2, windowMs: 60_000, keyGenerator: () => "user:perpath" },
      ["/a", "/b", "/c"],
    );

    expect((await post(app, { "x-forwarded-for": "192.0.2.31" }, {}, "/a")).status).toBe(200);
    expect((await post(app, { "x-forwarded-for": "192.0.2.32" }, {}, "/b")).status).toBe(200);
    expect((await post(app, { "x-forwarded-for": "192.0.2.33" }, {}, "/c")).status).toBe(200);

    // And repeating one and the same path still trips: the path really is
    // present in both default keys, which stay byte-identical to before.
    const ip = { "x-forwarded-for": "192.0.2.34" };
    expect((await post(app, ip, {}, "/a")).status).toBe(200); // id bucket for /a now at 2
    expect((await post(app, ip, {}, "/a")).status).toBe(429); // 3rd hit: id bucket for /a breached
  });
});

describe("userKey", () => {
  it("builds the per-user bucket key from the user id requireAuth put in the context", () => {
    const c = { get: (k: string) => (k === "userId" ? "u-42" : undefined) } as unknown as
      Parameters<typeof userKey>[0];
    expect(userKey(c)).toBe("user:u-42");
  });
});
