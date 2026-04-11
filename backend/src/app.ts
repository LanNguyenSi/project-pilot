import { Hono } from "hono";
import { ZodError } from "zod";
import type { AppEnv } from "./types/hono.js";
import { corsMiddleware } from "./middleware/cors.js";
import { securityHeaders } from "./middleware/security.js";
import { csrfProtection } from "./middleware/csrf.js";
import { health } from "./routes/health.js";
import { auth } from "./routes/auth.js";
import { credentials } from "./routes/credentials.js";
import { dashboard } from "./routes/dashboard.js";
import { forge } from "./routes/forge.js";
import { tasks } from "./routes/tasks.js";
import { deploy } from "./routes/deploy.js";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return c.json({ error: "Validation failed", issues }, 400);
  }
  console.error(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path}:`, err.message);
  const status = "status" in err && typeof err.status === "number" ? err.status : 500;
  return c.json(
    { error: status === 500 ? "Internal server error" : err.message },
    status as any,
  );
});

app.use("*", corsMiddleware);
app.use("*", securityHeaders);
app.use("/api/auth/*", csrfProtection);
app.use("/api/credentials/*", csrfProtection);
app.use("/api/dashboard/*", csrfProtection);
app.use("/api/forge/*", csrfProtection);
app.use("/api/tasks/*", csrfProtection);
app.use("/api/deploy/*", csrfProtection);

app.route("/api", health);
app.route("/api/auth", auth);
app.route("/api/credentials", credentials);
app.route("/api/dashboard", dashboard);
app.route("/api/forge", forge);
app.route("/api/tasks", tasks);
app.route("/api/deploy", deploy);

export { app };
