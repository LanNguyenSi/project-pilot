import { describe, it, expect } from "vitest";
import { isUpstreamTimeout } from "../src/lib/upstream-timeout";

describe("isUpstreamTimeout", () => {
  it("matches the DOMException AbortSignal.timeout() rejects with", () => {
    expect(isUpstreamTimeout(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe(true);
  });

  it("matches an explicit-abort DOMException (defensive arm)", () => {
    expect(isUpstreamTimeout(new DOMException("The operation was aborted", "AbortError"))).toBe(true);
  });

  it("rejects other DOMException names", () => {
    expect(isUpstreamTimeout(new DOMException("bad", "SyntaxError"))).toBe(false);
  });

  it("rejects a plain Error even if its name claims TimeoutError", () => {
    // Kills the mutant that drops the instanceof DOMException guard: a
    // renamed plain Error must not be classified as an upstream timeout.
    expect(isUpstreamTimeout(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(false);
  });

  it("rejects non-error values", () => {
    expect(isUpstreamTimeout(undefined)).toBe(false);
    expect(isUpstreamTimeout("TimeoutError")).toBe(false);
  });
});
