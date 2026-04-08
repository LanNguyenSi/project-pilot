import { Hono } from "hono";
import type { AppEnv } from "./types/hono.js";
import { corsMiddleware } from "./middleware/cors.js";
import { securityHeaders } from "./middleware/security.js";
import { health } from "./routes/health.js";

const app = new Hono<AppEnv>();

app.use("*", corsMiddleware);
app.use("*", securityHeaders);

app.route("/api", health);

export { app };
