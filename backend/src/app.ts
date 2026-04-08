import { Hono } from "hono";
import type { AppEnv } from "./types/hono.js";
import { corsMiddleware } from "./middleware/cors.js";
import { securityHeaders } from "./middleware/security.js";
import { csrfProtection } from "./middleware/csrf.js";
import { health } from "./routes/health.js";
import { auth } from "./routes/auth.js";
import { credentials } from "./routes/credentials.js";
import { dashboard } from "./routes/dashboard.js";

const app = new Hono<AppEnv>();

app.use("*", corsMiddleware);
app.use("*", securityHeaders);
app.use("/api/auth/*", csrfProtection);
app.use("/api/credentials/*", csrfProtection);
app.use("/api/dashboard/*", csrfProtection);

app.route("/api", health);
app.route("/api/auth", auth);
app.route("/api/credentials", credentials);
app.route("/api/dashboard", dashboard);

export { app };
