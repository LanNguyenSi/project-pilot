import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import type { Config } from "../src/config/index.js";

// Importing the config module runs its startup validation against
// process.env, so it is loaded dynamically once a minimal valid env is in
// place. parseConfig itself is a pure function over the env it is given.
let parseConfig: (env: NodeJS.ProcessEnv) => Config;

const REAL_SECRET = "test-session-secret-must-be-32chars!!";
let PLACEHOLDER: string;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://test";
  process.env.SESSION_SECRET = REAL_SECRET;
  const mod = await import("../src/config/index.js");
  parseConfig = mod.parseConfig;
  PLACEHOLDER = mod.PLACEHOLDER_SESSION_SECRETS[0];
});

const URL_KEYS = [
  "PROJECT_FORGE_URL",
  "AGENT_TASKS_URL",
  "DEPLOY_PANEL_URL",
] as const;

const URL_DEFAULTS: Record<(typeof URL_KEYS)[number], string> = {
  PROJECT_FORGE_URL: "https://project-forge.opentriologue.ai",
  AGENT_TASKS_URL: "https://agent-tasks.opentriologue.ai",
  DEPLOY_PANEL_URL: "https://deploy-panel.opentriologue.ai",
};

const SET_URLS = {
  PROJECT_FORGE_URL: "https://forge.internal",
  AGENT_TASKS_URL: "https://tasks.internal",
  DEPLOY_PANEL_URL: "https://deploy.internal",
};

function envWith(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://test",
    SESSION_SECRET: REAL_SECRET,
    ...SET_URLS,
    ...overrides,
  };
}

function without(env: NodeJS.ProcessEnv, keys: readonly string[]) {
  for (const key of keys) delete env[key];
  return env;
}

let warnSpy: { mock: { calls: unknown[][] }; mockRestore: () => void };

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}) as unknown as typeof warnSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const warnText = () => warnSpy.mock.calls.map((c) => String(c[0])).join("\n");

describe("SESSION_SECRET placeholder rejection", () => {
  it("production + placeholder secret throws naming SESSION_SECRET as a placeholder", () => {
    expect(() =>
      parseConfig(envWith({ NODE_ENV: "production", SESSION_SECRET: PLACEHOLDER })),
    ).toThrow(/SESSION_SECRET/i);
    try {
      parseConfig(envWith({ NODE_ENV: "production", SESSION_SECRET: PLACEHOLDER }));
    } catch (error) {
      expect(String(error)).toMatch(/placeholder/i);
    }
  });

  it("production + real secret is accepted", () => {
    const config = parseConfig(envWith({ NODE_ENV: "production" }));
    expect(config.SESSION_SECRET).toBe(REAL_SECRET);
    expect(warnSpy.mock.calls).toHaveLength(0);
  });

  it("development + placeholder secret is accepted with a warning", () => {
    const config = parseConfig(
      envWith({ NODE_ENV: "development", SESSION_SECRET: PLACEHOLDER }),
    );
    expect(config.SESSION_SECRET).toBe(PLACEHOLDER);
    expect(warnText()).toMatch(/placeholder/i);
  });

  it("the min(16) length rule still applies even outside production", () => {
    expect(() =>
      parseConfig(envWith({ NODE_ENV: "development", SESSION_SECRET: "short" })),
    ).toThrow(/SESSION_SECRET/i);
  });
});

describe("downstream service URL requirements", () => {
  it.each(URL_KEYS.map((key) => ({ key })))(
    "production + $key missing alone throws naming only $key",
    ({ key: missing }) => {
      const env = without(envWith({ NODE_ENV: "production" }), [missing]);
      let message = "";
      try {
        parseConfig(env);
      } catch (error) {
        message = String(error);
      }
      expect(message).toContain(missing);
      for (const other of URL_KEYS) {
        if (other !== missing) expect(message).not.toContain(other);
      }
    },
  );

  it("production + all three missing throws one error naming all three", () => {
    const env = without(envWith({ NODE_ENV: "production" }), URL_KEYS);
    let message = "";
    expect(() => parseConfig(env)).toThrow();
    try {
      parseConfig(env);
    } catch (error) {
      message = String(error);
    }
    expect(message.split("Missing required").length - 1).toBe(1);
    for (const key of URL_KEYS) expect(message).toContain(key);
  });

  it("production + all three set is accepted", () => {
    const config = parseConfig(envWith({ NODE_ENV: "production" }));
    expect(config.PROJECT_FORGE_URL).toBe(SET_URLS.PROJECT_FORGE_URL);
    expect(config.AGENT_TASKS_URL).toBe(SET_URLS.AGENT_TASKS_URL);
    expect(config.DEPLOY_PANEL_URL).toBe(SET_URLS.DEPLOY_PANEL_URL);
  });

  it.each(URL_KEYS.map((key) => ({ key })))(
    "production + $key set to empty string throws (empty counts as missing)",
    ({ key }) => {
      expect(() =>
        parseConfig(envWith({ NODE_ENV: "production", [key]: "" })),
      ).toThrow(new RegExp(key));
    },
  );

  it("development + URLs absent falls back to defaults with one warning", () => {
    const config = parseConfig(without(envWith({ NODE_ENV: "development" }), URL_KEYS));
    for (const key of URL_KEYS) expect(config[key]).toBe(URL_DEFAULTS[key]);
    expect(warnSpy.mock.calls).toHaveLength(1);
    for (const key of URL_KEYS) expect(warnText()).toContain(key);
  });

  it("development + URLs set uses given values with no warning", () => {
    const config = parseConfig(envWith({ NODE_ENV: "development" }));
    expect(config.PROJECT_FORGE_URL).toBe(SET_URLS.PROJECT_FORGE_URL);
    expect(config.DEPLOY_PANEL_URL).toBe(SET_URLS.DEPLOY_PANEL_URL);
    expect(warnSpy.mock.calls).toHaveLength(0);
  });
});
