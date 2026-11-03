export interface ClosableServer {
  close(callback?: () => void): unknown;
}

export interface ShutdownDeps {
  /** The running HTTP server; close() stops accepting new connections. */
  server: ClosableServer;
  /** Cleanup hooks (e.g. disconnecting the Prisma client) run after drain. */
  cleanup: () => unknown | Promise<unknown>;
  /** Milliseconds to wait for in-flight requests before forcing exit(1). */
  deadlineMs: number;
  /** Arms the hard deadline; injectable so tests can drive it with fakes. */
  scheduleDeadline: (callback: () => void, ms: number) => unknown;
  /** Cancels a deadline armed by scheduleDeadline. */
  cancelDeadline: (handle: unknown) => void;
  /** Process exit function (process.exit in production). */
  exit: (code: number) => void;
}

/**
 * Builds the SIGTERM/SIGINT shutdown handler for the backend server.
 *
 * On the first signal: stop accepting connections (server.close()), wait for
 * in-flight requests to drain, run cleanup, then exit(0). A hard deadline below
 * Docker's default 10s stop grace period forces exit(1) if a hung connection
 * keeps close() from completing, so a stuck request cannot block a container
 * restart forever. A second signal while shutting down is ignored.
 *
 * The returned function resolves once exit(0) has been reached, which lets the
 * handler be tested with fakes (fake server, timer, cleanup and exit).
 */
export function createShutdownHandler(deps: ShutdownDeps): () => Promise<void> {
  let shuttingDown = false;

  return () => {
    if (shuttingDown) return Promise.resolve();
    shuttingDown = true;

    const deadline = deps.scheduleDeadline(() => deps.exit(1), deps.deadlineMs);

    return new Promise<void>((resolve) => {
      deps.server.close(() => {
        deps.cancelDeadline(deadline);
        void Promise.resolve()
          .then(() => deps.cleanup())
          .catch(() => undefined)
          .then(() => {
            deps.exit(0);
            resolve();
          });
      });
    });
  };
}
