import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { csrfProtection } from "../src/middleware/csrf.js";

/**
 * MUTATION COVERAGE — csrf.ts has two guards:
 *
 *   Guard A (safe-method bypass): `if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next()`
 *   Guard B (header check):       `if (requested !== "XMLHttpRequest") return c.json({...}, 403)`
 *
 * Mutation A — remove the safe-method bypass:
 *   → GET/HEAD tests that expect 200 now receive 403. "GET bypasses" test kills it.
 *
 * Mutation B — remove or weaken the header check (e.g. change !== to ===, or delete the guard):
 *   → POST-without-header tests that expect 403 now receive 200. "POST without header" test kills it.
 */
function makeApp() {
  const app = new Hono();
  app.use("*", csrfProtection);
  app.get("/resource", (c) => c.json({ ok: true }));
  app.on("HEAD", "/resource", (c) => c.body(null));
  app.post("/resource", (c) => c.json({ ok: true }));
  app.put("/resource", (c) => c.json({ ok: true }));
  app.delete("/resource", (c) => c.json({ ok: true }));
  return app;
}

const app = makeApp();

describe("csrfProtection — safe methods bypass (Guard A)", () => {
  it("GET bypasses CSRF check, no header needed → 200", async () => {
    const res = await app.request("/resource", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("HEAD bypasses CSRF check, no header needed → 200", async () => {
    const res = await app.request("/resource", { method: "HEAD" });
    // HEAD returns no body; status should still be 200
    expect(res.status).toBe(200);
  });

  it("GET with X-Requested-With present still passes (header is optional for safe methods) → 200", async () => {
    const res = await app.request("/resource", {
      method: "GET",
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    expect(res.status).toBe(200);
  });
});

describe("csrfProtection — unsafe methods without correct header (Guard B enforcement)", () => {
  it("POST without X-Requested-With → 403 with error:csrf_failed", async () => {
    const res = await app.request("/resource", { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("csrf_failed");
    expect(body.message).toMatch(/X-Requested-With/i);
  });

  it("PUT without X-Requested-With → 403", async () => {
    const res = await app.request("/resource", { method: "PUT" });
    expect(res.status).toBe(403);
  });

  it("DELETE without X-Requested-With → 403", async () => {
    const res = await app.request("/resource", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("POST with wrong X-Requested-With value ('fetch') → 403 (exact match required)", async () => {
    const res = await app.request("/resource", {
      method: "POST",
      headers: { "x-requested-with": "fetch" },
    });
    expect(res.status).toBe(403);
  });

  it("POST with empty X-Requested-With → 403", async () => {
    const res = await app.request("/resource", {
      method: "POST",
      headers: { "x-requested-with": "" },
    });
    expect(res.status).toBe(403);
  });

  it("POST with XMLHttpRequest in wrong case → 403 (case-sensitive match)", async () => {
    const res = await app.request("/resource", {
      method: "POST",
      headers: { "x-requested-with": "xmlhttprequest" },
    });
    expect(res.status).toBe(403);
  });
});

describe("csrfProtection — unsafe methods with correct header (Guard B: allow through)", () => {
  it("POST with X-Requested-With: XMLHttpRequest → passes to next handler (200)", async () => {
    const res = await app.request("/resource", {
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("PUT with X-Requested-With: XMLHttpRequest → passes to next handler (200)", async () => {
    const res = await app.request("/resource", {
      method: "PUT",
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    expect(res.status).toBe(200);
  });

  it("DELETE with X-Requested-With: XMLHttpRequest → passes to next handler (200)", async () => {
    const res = await app.request("/resource", {
      method: "DELETE",
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    expect(res.status).toBe(200);
  });
});
