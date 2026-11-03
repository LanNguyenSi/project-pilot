export interface ClosableServer {
  close(callback?: () => void): unknown;
  /**
   * Closes idle keep-alive connections now; present on the Node http server,
   * absent in some fakes and on old runtimes, so it is called only if present.
   */
  closeIdleConnections?(): void;
}

export interface ShutdownDeps {
  /** The running HTTP server; close() stops accepting new connections. */
  server: ClosableServer;
  /** Cleanup hooks (e.g. disconnecting the Prisma client) run after drain. */
  cleanup: () => unknown | Promise<unknown>;
  /** Milliseconds to wait for in-flight requests before forcing exit(1). */
  deadlineMs: number;
  /** Milliseconds between closeIdleConnections() calls while draining. */
  drainIntervalMs: number;
  /** Arms the hard deadline; injectable so tests can drive it with fakes. */
  scheduleDeadline: (callback: () => void, ms: number) => unknown;
  /** Cancels a deadline armed by scheduleDeadline. */
  cancelDeadline: (handle: unknown) => void;
  /** Arms the keep-alive drain tick; injectable so tests can drive it. */
  scheduleInterval: (callback: () => void, ms: number) => unknown;
  /** Cancels an interval armed by scheduleInterval. */
  cancelInterval: (handle: unknown) => void;
  /** Logs a failed cleanup before exiting anyway (console.error in prod). */
  log: (message: string, error: unknown) => void;
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
 * close() only closes idle keep-alive connections once, at the moment of the
 * call, so closeIdleConnections() is also ticked on an interval until close()
 * completes; otherwise a connection that turns idle after the signal would
 * hold the exit until its own keepAliveTimeout. A cleanup that rejects is
 * logged and the process still exits 0: the drain succeeded and there is
 * nothing left to do after the exit.
 *
 * The returned function resolves once exit(0) has been reached, which lets the
 * handler be tested with fakes (fake server, timers, cleanup, logger, exit).
 */
export function createShutdownHandler(deps: ShutdownDeps): () => Promise<void> {
  let shuttingDown = false;

  return () => {
    if (shuttingDown) return Promise.resolve();
    shuttingDown = true;

    let drainInterval: unknown;
    let closed = false;
    const stopDrainInterval = () => {
      if (drainInterval !== undefined) deps.cancelInterval(drainInterval);
    };

    const deadline = deps.scheduleDeadline(() => {
      stopDrainInterval();
      deps.exit(1);
    }, deps.deadlineMs);

    return new Promise<void>((resolve) => {
      deps.server.close(() => {
        closed = true;
        stopDrainInterval();
        deps.cancelDeadline(deadline);
        void Promise.resolve()
          .then(() => deps.cleanup())
          .catch((error: unknown) =>
            deps.log("shutdown: cleanup failed, exiting anyway", error),
          )
          .then(() => {
            deps.exit(0);
            resolve();
          });
      });

      if (!closed && deps.server.closeIdleConnections) {
        drainInterval = deps.scheduleInterval(
          () => deps.server.closeIdleConnections?.(),
          deps.drainIntervalMs,
        );
      }
    });
  };
}
