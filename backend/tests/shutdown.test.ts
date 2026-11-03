/**
 * Graceful-shutdown state machine (src/shutdown.ts) driven entirely by fakes: a
 * fake server whose close() callback we fire by hand, fake timers whose
 * deadline and keep-alive drain ticks we fire by hand, a fake cleanup hook,
 * a fake logger and a fake exit. No real server, timer, connection pool or
 * process exit is touched.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createShutdownHandler,
  type ClosableServer,
  type ShutdownDeps,
} from "../src/shutdown.js";

function createFakes(overrides: Partial<ShutdownDeps> = {}) {
  const closeCallbacks: Array<() => void> = [];
  const deadlines: Array<() => void> = [];
  const intervals: Array<() => void> = [];
  const cancelledIntervals = new Set<unknown>();
  const log: string[] = [];

  const close = vi.fn((cb?: () => void) => {
    log.push("close");
    if (cb) closeCallbacks.push(cb);
  });
  const closeIdleConnections = vi.fn(() => {
    log.push("closeIdleConnections");
  });
  const scheduleDeadline = vi.fn((cb: () => void) => {
    const handle = deadlines.length;
    deadlines.push(cb);
    return handle;
  });
  const cancelDeadline = vi.fn(() => {
    log.push("cancel");
  });
  const scheduleInterval = vi.fn((cb: () => void) => {
    const handle = intervals.length;
    intervals.push(cb);
    return handle;
  });
  const cancelInterval = vi.fn((handle: unknown) => {
    cancelledIntervals.add(handle);
  });
  const cleanup = vi.fn(async () => {
    log.push("cleanup");
  });
  const logger = vi.fn();
  const exit = vi.fn((code: number) => {
    log.push(`exit(${code})`);
  });

  const deps: ShutdownDeps = {
    server: { close, closeIdleConnections },
    cleanup,
    deadlineMs: 8000,
    drainIntervalMs: 250,
    scheduleDeadline,
    cancelDeadline,
    scheduleInterval,
    cancelInterval,
    log: logger,
    exit,
    ...overrides,
  };

  return {
    deps,
    close,
    closeIdleConnections,
    scheduleDeadline,
    cancelDeadline,
    scheduleInterval,
    cancelInterval,
    cleanup,
    logger,
    exit,
    log,
    fireClose: () => closeCallbacks.forEach((cb) => cb()),
    fireDeadline: (i = 0) => deadlines[i](),
    // A cancelled tick never fires, like a cleared real timer.
    fireInterval: (handle = 0) => {
      if (!cancelledIntervals.has(handle)) intervals[handle]?.();
    },
  };
}

describe("createShutdownHandler", () => {
  it("signal -> close -> cleanup -> exit(0)", async () => {
    const f = createFakes();
    const done = createShutdownHandler(f.deps)();

    // The signal stops the listener and arms the deadline before draining.
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.scheduleDeadline).toHaveBeenCalledWith(expect.any(Function), 8000);
    // In-flight requests are still running: nothing has exited or cleaned up.
    expect(f.exit).not.toHaveBeenCalled();
    expect(f.cleanup).not.toHaveBeenCalled();

    // In-flight requests drain, so server.close()'s callback fires.
    f.fireClose();
    await done;

    expect(f.cleanup).toHaveBeenCalledTimes(1);
    expect(f.cancelDeadline).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledWith(0);
    expect(f.log).toEqual(["close", "cancel", "cleanup", "exit(0)"]);
  });

  it("close never completes -> exit(1) once the deadline fires", () => {
    const f = createFakes();
    // The close callback is never invoked: the server hangs on a request.
    createShutdownHandler(f.deps)();

    expect(f.exit).not.toHaveBeenCalled();
    f.fireDeadline();

    expect(f.exit).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledWith(1);
    expect(f.cleanup).not.toHaveBeenCalled();
    expect(f.cancelDeadline).not.toHaveBeenCalled();
  });

  it("a second signal during shutdown does not run shutdown twice", async () => {
    const f = createFakes();
    const shutdown = createShutdownHandler(f.deps);
    const first = shutdown();
    const second = shutdown();

    // The second signal is a no-op: exactly one close, one deadline armed.
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.scheduleDeadline).toHaveBeenCalledTimes(1);

    f.fireClose();
    await Promise.all([first, second]);

    expect(f.exit).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledWith(0);
  });

  it("keep-alive connections are drained until close completes, then stop", async () => {
    const f = createFakes();
    const done = createShutdownHandler(f.deps)();

    // The drain tick is armed with the injected interval and cadence.
    expect(f.scheduleInterval).toHaveBeenCalledWith(expect.any(Function), 250);

    // Close has not completed: every tick closes idle keep-alive connections.
    f.fireInterval();
    f.fireInterval();
    expect(f.closeIdleConnections).toHaveBeenCalledTimes(2);

    f.fireClose();
    await done;

    // Close completed: the interval is cancelled and no tick runs after.
    expect(f.cancelInterval).toHaveBeenCalledTimes(1);
    f.fireInterval();
    expect(f.closeIdleConnections).toHaveBeenCalledTimes(2);
    expect(f.exit).toHaveBeenCalledWith(0);
  });

  it("the deadline cancels the keep-alive drain tick and exits 1", () => {
    const f = createFakes();
    createShutdownHandler(f.deps)();

    f.fireDeadline();

    expect(f.cancelInterval).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledWith(1);
  });

  it("a server without closeIdleConnections still shuts down", async () => {
    const server: ClosableServer = {
      close: (cb?: () => void) => {
        if (cb) cb();
      },
    };
    const f = createFakes({ server });
    await createShutdownHandler(f.deps)();

    expect(f.scheduleInterval).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledWith(0);
  });

  it("cleanup rejection is logged and exit(0) is still reached", async () => {
    const error = new Error("prisma did not disconnect");
    const cleanup = vi.fn(async () => {
      throw error;
    });
    const f = createFakes({ cleanup });
    const done = createShutdownHandler(f.deps)();

    f.fireClose();
    await done;

    expect(f.logger).toHaveBeenCalledWith(expect.stringContaining("cleanup"), error);
    expect(f.exit).toHaveBeenCalledTimes(1);
    expect(f.exit).toHaveBeenCalledWith(0);
  });
});
