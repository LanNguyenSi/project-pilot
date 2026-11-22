import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The real rate limiter is used here (forge-routes.test.ts and
// tasks-routes.test.ts mock it away). Every upstream call is stubbed, so a
// 429 can only come from the limiter. Every bucket key carries the request
// path, so the five routes never share a bucket, and each case below uses
// its own user ids and addresses so cases cannot tip each other over.

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    PROJECT_FORGE_URL: "http://forge.test",
    AGENT_TASKS_URL: "http://tasks.test",
    DEPLOY_PANEL_URL: "http://deploy.test",
  },
  hasGitHubOAuthConfigured: false,
}));

// The test picks the user per request through a header.
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("userId", c.req.header("x-test-user"));
    await next();
  }),
}));

vi.mock("../src/services/credentials.js", () => ({
  getCredential: vi.fn(async () => "test-token"),
}));

vi.mock("../src/services/agent-tasks-client.js", () => ({
  agentTasksRequest: vi.fn(async () => ({ ok: true, data: { synced: 0, created: 0 } })),
}));

vi.mock("../src/services/forge-task-snapshot.js", () => ({
  extractPreviewTasks: vi.fn(() => []),
  saveForgeTaskSnapshot: vi.fn(async () => undefined),
  linkForgeSnapshotToRepo: vi.fn(async () => undefined),
}));

vi.mock("../src/services/forge-task-migration.js", () => ({
  migrateForgeTasks: vi.fn(),
}));

import { deploy } from "../src/routes/deploy.js";
import { tasks } from "../src/routes/tasks.js";
import { forge } from "../src/routes/forge.js";

const SESSION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

// Bodies that pass each route's schema, so a 200 (never a 400) proves the
// request reached the handler past the limiter.
const RELAY_BODY = { name: "vps", host: "1.2.3.4", sshPassword: "s" };
const PROBE_BODY = { host: "1.2.3.4", sshPassword: "s" };
const GENERATE_BODY = { projectName: "demo-app", summary: "A demo app" };
const PUBLISH_BODY = { sessionId: SESSION_ID };

function post(router: any, path: string, user: string, ip: string, body?: unknown) {
  return router.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-user": user,
      "x-forwarded-for": ip,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const installRelay = (user: string, ip: string) => post(deploy, "/install-relay", user, ip, RELAY_BODY);
const probeVps = (user: string, ip: string) => post(deploy, "/probe-vps", user, ip, PROBE_BODY);
const teamSync = (user: string, ip: string, teamId = "team-a") =>
  post(tasks, `/teams/${teamId}/sync`, user, ip);
const forgeGenerate = (user: string, ip: string) => post(forge, "/generate", user, ip, GENERATE_BODY);
const forgePublish = (user: string, ip: string) => post(forge, "/publish", user, ip, PUBLISH_BODY);

interface LimitedRoute {
  label: string;
  max: number;
  call: (user: string, ip: string) => Promise<Response>;
  // Same route with a body its schema rejects (400); absent when the route
  // has no body schema.
  invalidCall?: (user: string, ip: string) => Promise<Response>;
}

// The maxima mirror the named constants in deploy.ts, tasks.ts and
// forge.ts: swapping a constant breaks the boundary case of that route.
const ROUTES: LimitedRoute[] = [
  { label: "POST /deploy/install-relay", max: 3, call: installRelay, invalidCall: (u, ip) => post(deploy, "/install-relay", u, ip, {}) },
  { label: "POST /deploy/probe-vps", max: 5, call: probeVps, invalidCall: (u, ip) => post(deploy, "/probe-vps", u, ip, {}) },
  { label: "POST /tasks/teams/:teamId/sync", max: 3, call: (u, ip) => teamSync(u, ip) },
  { label: "POST /forge/generate", max: 5, call: forgeGenerate, invalidCall: (u, ip) => post(forge, "/generate", u, ip, {}) },
  { label: "POST /forge/publish", max: 5, call: forgePublish, invalidCall: (u, ip) => post(forge, "/publish", u, ip, {}) },
];

// Upstream stub for every test in this file: answer locally so the only
// thing that can reject a call is the limiter. A fresh Response per call: a
// consumed body cannot be parsed twice.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("install-relay")) {
        return new Response("event: done\ndata: {}\n\n", {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      if (href.includes("/api/v1/publish")) {
        return new Response(
          JSON.stringify({
            result: { repoUrl: "https://github.com/o/r", cloneUrl: "https://x", projectName: "demo-app" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (href.includes("/api/v1/generate")) {
        return new Response(JSON.stringify({ sessionId: SESSION_ID, preview: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ probe: {}, hostKeySha256: "x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(ROUTES)("$label rate limit", ({ max, call, invalidCall }) => {
  it("same user and same address: the max number of calls pass, the next is 429 with Retry-After", async () => {
    for (let i = 0; i < max; i++) {
      expect((await call("limit-user", "limit-ip")).status).toBe(200);
    }
    const res = await call("limit-user", "limit-ip");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests. Please try again later.",
    });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("same user from different addresses: the per-user bucket limits", async () => {
    // One fresh address per call, so no address bucket can fill up: only the
    // per-user bucket can produce the 429.
    for (let i = 0; i < max; i++) {
      expect((await call("rot-user", `rot-ip-${i}`)).status).toBe(200);
    }
    expect((await call("rot-user", "rot-ip-fresh")).status).toBe(429);
  });

  it("different users from one address: the shared address bucket limits (existing middleware semantics, the IP bucket is always applied)", async () => {
    // One call each by max different users from one shared address: every
    // per-user bucket holds 1, so only the shared address bucket can fill up.
    for (let i = 0; i < max; i++) {
      expect((await call(`many-user-${i}`, "many-ip")).status).toBe(200);
    }
    // A brand-new user from the same address is refused: the address bucket
    // was checked first and already breached.
    expect((await call("many-user-fresh", "many-ip")).status).toBe(429);
  });

  it("the 60 s window reopens the quota only after it elapsed", async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < max; i++) {
        expect((await call("win-user", "win-ip")).status).toBe(200);
      }
      expect((await call("win-user", "win-ip")).status).toBe(429);
      // Still inside the 60 s window that started at the first hit.
      vi.advanceTimersByTime(59_000);
      expect((await call("win-user", "win-ip")).status).toBe(429);
      // Past the window: the next call opens a fresh one.
      vi.advanceTimersByTime(1_001);
      expect((await call("win-user", "win-ip")).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  // Team sync has no body schema, so it has no invalid body to send.
  it.skipIf(!invalidCall)("the limiter runs before body validation: rejected bodies use up the quota", async () => {
    for (let i = 0; i < max; i++) {
      expect((await invalidCall!("val-user", "val-ip")).status).toBe(400);
    }
    // A valid body from the same user and address is now refused by the
    // limiter; with validation first, the 400s would not have counted.
    expect((await call("val-user", "val-ip")).status).toBe(429);
  });

  it("different users from different addresses: nobody is limited", async () => {
    for (let i = 0; i < max + 2; i++) {
      expect((await call(`free-user-${i}`, `free-ip-${i}`)).status).toBe(200);
    }
  });
});

describe("POST /tasks/teams/:teamId/sync path buckets", () => {
  it("keys the buckets on the full path: same user and address, two team ids are separate buckets", async () => {
    // Fill team-a's user bucket to its max with one shared address.
    for (let i = 0; i < 3; i++) {
      expect((await teamSync("teams-user", "teams-ip", "team-a")).status).toBe(200);
    }
    // The first team-b call is the 4th for this user and address overall, so
    // a path-independent bucket would answer 429 here; it does not: team ids
    // get separate buckets.
    expect((await teamSync("teams-user", "teams-ip", "team-b")).status).toBe(200);
    // team-a is still exhausted.
    expect((await teamSync("teams-user", "teams-ip", "team-a")).status).toBe(429);
  });
});

describe("upstream stub control", () => {
  it("a stubbed-upstream success answers 200 on every route (control for the 200s above)", async () => {
    // Guards the suite itself: if a stub body shape broke, the limit tests
    // would count 400/502 as "passing" instead of quota successes.
    expect((await installRelay("stub-user", "stub-ip-1")).status).toBe(200);
    expect((await probeVps("stub-user", "stub-ip-2")).status).toBe(200);
    expect((await teamSync("stub-user", "stub-ip-3")).status).toBe(200);
    expect((await forgeGenerate("stub-user", "stub-ip-4")).status).toBe(200);
    expect((await forgePublish("stub-user", "stub-ip-5")).status).toBe(200);
  });
});
