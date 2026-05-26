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

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

export const hasGitHubOAuthConfigured = Boolean(
  parsed.data.GITHUB_CLIENT_ID && parsed.data.GITHUB_CLIENT_SECRET,
);
