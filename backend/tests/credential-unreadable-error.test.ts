import { describe, it, expect, vi } from "vitest";

vi.mock("../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-must-be-32chars!!",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:3001",
    CORS_ORIGINS: "http://localhost:3000",
    PROJECT_FORGE_URL: "http://forge.test",
    AGENT_TASKS_URL: "http://tasks.test",
    DEPLOY_PANEL_URL: "http://deploy.test",
  },
  hasGitHubOAuthConfigured: false,
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: { serviceCredential: { findUnique: vi.fn() } },
}));

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: vi.fn(async (c: any, next: any) => {
    c.set("userId", "user-a");
    await next();
  }),
}));

import { prisma } from "../src/lib/prisma.js";
import { app } from "../src/app.js";

describe("app error handler: unreadable stored credential", () => {
  it("answers 409 credential_unreadable instead of a 500 when a route needs an undecryptable credential", async () => {
    (prisma.serviceCredential.findUnique as any).mockResolvedValue({ token: "not-encrypted" });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.request("/api/forge/projects", { method: "GET" });
    expect(res.status).toBe(409);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0][0]);
    expect(logged).toContain("GET /api/forge/projects");
    expect(logged).toContain("project-forge");
    expect(logged).not.toContain("not-encrypted");
    errorSpy.mockRestore();
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("credential_unreadable");
    expect(body.error).toMatch(/Re-enter it in \/settings/);
  });
});
