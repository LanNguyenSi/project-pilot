/**
 * Graceful-shutdown state machine (src/shutdown.ts) driven entirely by fakes: a
 * fake server whose close() callback we fire by hand, a fake timer whose
 * deadline we fire by hand, a fake cleanup hook and a fake exit. No real server,
 * timer, connection pool or process exit is touched.
 */
import { describe, expect, it, vi } from "vitest";
import { createShutdownHandler, type ShutdownDeps } from "../src/shutdown.js";

function createFakes() {
  const closeCallbacks: Array<() => void> = [];
  const deadlines: Array<() => void> = [];
  const log: string[] = [];

  const close = vi.fn((cb?: () => void) => {
    log.push("close");
    if (cb) closeCallbacks.push(cb);
  });
  const scheduleDeadline = vi.fn((cb: () => void) => {
    const handle = deadlines.length;
    deadlines.push(cb);
    return handle;
  });
  const cancelDeadline = vi.fn(() => {
    log.push("cancel");
  });
  const cleanup = vi.fn(async () => {
    log.push("cleanup");
  });
  const exit = vi.fn((code: number) => {
    log.push(`exit(${code})`);
  });

  const deps: ShutdownDeps = {
    server: { close },
    cleanup,
    deadlineMs: 8000,
    scheduleDeadline,
    cancelDeadline,
    exit,
  };

  return {
    deps,
    close,
    scheduleDeadline,
    cancelDeadline,
    cleanup,
    exit,
    log,
    fireClose: () => closeCallbacks.forEach((cb) => cb()),
    fireDeadline: (i = 0) => deadlines[i](),
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
});
