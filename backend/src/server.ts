import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config/index.js";
import { prisma } from "./lib/prisma.js";
import { createShutdownHandler } from "./shutdown.js";

// Below Docker's default 10s stop grace period: in-flight requests get 8s to
// finish, then the process exits 1 so a hung connection cannot block a restart.
const SHUTDOWN_DEADLINE_MS = 8000;

// close() only closes idle keep-alive connections once, so they are ticked
// closed every 250 ms while in-flight requests drain.
const SHUTDOWN_DRAIN_INTERVAL_MS = 250;

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`project-pilot backend running on http://localhost:${info.port}`);
});

const shutdown = createShutdownHandler({
  server,
  cleanup: () => prisma.$disconnect(),
  deadlineMs: SHUTDOWN_DEADLINE_MS,
  drainIntervalMs: SHUTDOWN_DRAIN_INTERVAL_MS,
  scheduleDeadline: (callback, ms) => setTimeout(callback, ms),
  cancelDeadline: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  scheduleInterval: (callback, ms) => setInterval(callback, ms),
  cancelInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
  log: (message, error) => console.error(message, error),
  exit: (code) => process.exit(code),
});

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
