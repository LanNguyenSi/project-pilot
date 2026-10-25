import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:3001"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // GitHub OAuth App, optional so local dev + self-hosted users without an
  // OAuth App configured can still run project-pilot on email/password alone.
  // When either is absent, the /api/oauth/github/* routes return 503.
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  PROJECT_FORGE_URL: z
    .string()
    .default("https://project-forge.opentriologue.ai"),
  AGENT_TASKS_URL: z
    .string()
    .default("https://agent-tasks.opentriologue.ai"),
  DEPLOY_PANEL_URL: z
    .string()
    .default("https://deploy-panel.opentriologue.ai"),
});

// Known placeholder SESSION_SECRET values shipped in example and compose
// templates. They clear the min(16) length rule above, so in production they
// must be rejected explicitly or a deploy silently derives credentials from a
// publicly known key.
export const PLACEHOLDER_SESSION_SECRETS = [
  "change-me-to-something-secure",
  "dev-credential-key-change-me",
] as const;

// Downstream services whose schema defaults above are public
// opentriologue.ai instances: fine for local development, dangerous in
// production where they would receive users' forwarded GitHub tokens, so they
// are required (not defaulted) there.
const SERVICE_URL_KEYS = [
  "PROJECT_FORGE_URL",
  "AGENT_TASKS_URL",
  "DEPLOY_PANEL_URL",
] as const;

export type Config = z.infer<typeof configSchema>;

// Validates `env` (process.env at startup, a controlled object in tests).
// Throws on any fatal problem so the caller decides how to exit; a schema
// default only fills an absent key, so an empty service URL is turned into an
// absent key on a copy before parsing (development really gets the default)
// while the required-in-production check still reads the raw `env` (an empty
// string counts as missing there too) and the fallback the warning reports is
// taken from the parsed default.
export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const schemaEnv = { ...env };
  for (const key of SERVICE_URL_KEYS) {
    if (schemaEnv[key] === "") delete schemaEnv[key];
  }
  const parsed = configSchema.safeParse(schemaEnv);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${JSON.stringify(
        parsed.error.format(),
        null,
        2,
      )}`,
    );
  }

  const data = parsed.data;
  const isProduction = data.NODE_ENV === "production";
  const errors: string[] = [];

  const isPlaceholder = (
    PLACEHOLDER_SESSION_SECRETS as readonly string[]
  ).includes(data.SESSION_SECRET);
  if (isPlaceholder) {
    if (isProduction) {
      errors.push(
        "SESSION_SECRET is set to a known placeholder value; set a unique secret before running in production",
      );
    } else {
      console.warn(
        `SESSION_SECRET "${data.SESSION_SECRET}" is a known placeholder value; acceptable only outside production`,
      );
    }
  }

  const missingServiceUrls = SERVICE_URL_KEYS.filter((key) => !env[key]);
  if (missingServiceUrls.length > 0) {
    if (isProduction) {
      errors.push(
        `Missing required downstream service URL(s) in production: ${missingServiceUrls.join(
          ", ",
        )}. Set each to an instance you trust.`,
      );
    } else {
      console.warn(
        `Using default downstream service URLs (public opentriologue.ai instances): ${missingServiceUrls
          .map((key) => `${key}=${data[key]}`)
          .join(", ")}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return data;
}

function loadConfig(): Config {
  try {
    return parseConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export const config = loadConfig();

export const hasGitHubOAuthConfigured = Boolean(
  config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET,
);
