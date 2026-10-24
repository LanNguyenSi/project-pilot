import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * zod 4 `.default()` output pins for the config schema.
 *
 * In zod 4 a default short-circuits the inner schema, so `z.coerce.number()
 * .default(3001)` must still produce the number 3001 (not a string) when
 * PORT is absent, the string coercion of "4321" to 4321 must survive, and
 * every string default must be passed through as the identical value.
 */

const DEFAULTS = {
  CORS_ORIGINS: "http://localhost:3000",
  FRONTEND_URL: "http://localhost:3000",
  BACKEND_URL: "http://localhost:3001",
  NODE_ENV: "development",
  PROJECT_FORGE_URL: "https://project-forge.opentriologue.ai",
  AGENT_TASKS_URL: "https://agent-tasks.opentriologue.ai",
  DEPLOY_PANEL_URL: "https://deploy-panel.opentriologue.ai",
} as const;

const MANAGED_KEYS = ["PORT", ...Object.keys(DEFAULTS)];

async function loadConfig(env: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const saved = { ...process.env };
  try {
    for (const k of MANAGED_KEYS) delete process.env[k];
    process.env.DATABASE_URL = "postgresql://test";
    process.env.SESSION_SECRET = "test-session-secret-must-be-32chars!!";
    Object.assign(process.env, env);
    vi.resetModules();
    const mod = await import("../src/config/index.js");
    return mod.config as unknown as Record<string, unknown>;
  } finally {
    process.env = saved;
  }
}

describe("config defaults under zod 4 default semantics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("PORT defaults to the number 3001 when env PORT is absent", async () => {
    const config = await loadConfig();
    expect(config.PORT).toBe(3001);
    expect(typeof config.PORT).toBe("number");
  });

  it("PORT '4321' coerces to the number 4321 (z.coerce.number unchanged)", async () => {
    const config = await loadConfig({ PORT: "4321" });
    expect(config.PORT).toBe(4321);
  });

  it("NODE_ENV defaults to the string 'development'", async () => {
    const config = await loadConfig();
    expect(config.NODE_ENV).toBe(DEFAULTS.NODE_ENV);
  });

  it("CORS_ORIGINS keeps its default verbatim", async () => {
    const config = await loadConfig();
    expect(config.CORS_ORIGINS).toBe(DEFAULTS.CORS_ORIGINS);
  });

  it("PROJECT_FORGE_URL default is byte-identical (no url normalization)", async () => {
    const config = await loadConfig();
    expect(config.PROJECT_FORGE_URL).toBe(DEFAULTS.PROJECT_FORGE_URL);
  });

  it("AGENT_TASKS_URL and DEPLOY_PANEL_URL defaults are byte-identical", async () => {
    const config = await loadConfig();
    expect(config.AGENT_TASKS_URL).toBe(DEFAULTS.AGENT_TASKS_URL);
    expect(config.DEPLOY_PANEL_URL).toBe(DEFAULTS.DEPLOY_PANEL_URL);
  });

  it("explicit URL env values are passed through unchanged", async () => {
    const config = await loadConfig({
      PROJECT_FORGE_URL: "https://HTTP://Example.COM:8443/Path",
      FRONTEND_URL: "http://localhost:3001",
    });
    expect(config.PROJECT_FORGE_URL).toBe("https://HTTP://Example.COM:8443/Path");
    expect(config.FRONTEND_URL).toBe("http://localhost:3001");
  });
});
