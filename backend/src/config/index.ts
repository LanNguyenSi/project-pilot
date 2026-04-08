import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
