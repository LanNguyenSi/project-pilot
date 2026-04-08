import { cors } from "hono/cors";
import { config } from "../config/index.js";

export const corsMiddleware = cors({
  origin: config.CORS_ORIGINS.split(",").map((o) => o.trim()),
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
