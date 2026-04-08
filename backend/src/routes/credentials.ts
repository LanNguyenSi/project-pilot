import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { upsertCredential, listCredentials, deleteCredential, isValidService } from "../services/credentials.js";
import type { AppEnv } from "../types/hono.js";

const credentials = new Hono<AppEnv>();

credentials.use("*", requireAuth);

const upsertSchema = z.object({
  service: z.enum(["project-forge", "agent-tasks", "deploy-panel"]),
  token: z.string().min(1),
  label: z.string().optional(),
});

// GET /credentials — list all (no tokens returned)
credentials.get("/", async (c) => {
  const userId = c.get("userId")!;
  const creds = await listCredentials(userId);
  return c.json({ credentials: creds });
});

// PUT /credentials — upsert a service credential
credentials.put("/", zValidator("json", upsertSchema), async (c) => {
  const userId = c.get("userId")!;
  const { service, token, label } = c.req.valid("json");

  const cred = await upsertCredential(userId, service, token, label);
  return c.json({ credential: cred });
});

// DELETE /credentials/:service
credentials.delete("/:service", async (c) => {
  const userId = c.get("userId")!;
  const service = c.req.param("service");

  if (!isValidService(service)) {
    return c.json({ error: "invalid_service", message: "Unknown service" }, 400);
  }

  try {
    await deleteCredential(userId, service);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "not_found", message: "Credential not found" }, 404);
  }
});

export { credentials };
