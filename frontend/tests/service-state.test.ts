import { describe, expect, it } from "vitest";
import { serviceState } from "../src/lib/service-state";

describe("serviceState", () => {
  it("maps a configured service without error to connected", () => {
    expect(serviceState({ configured: true })).toBe("connected");
    expect(serviceState({ configured: true, error: null })).toBe("connected");
  });

  it("maps a service without a stored credential to not_configured", () => {
    expect(serviceState({ configured: false })).toBe("not_configured");
  });

  it("maps a missing status (summary not loaded yet) to not_configured", () => {
    expect(serviceState(undefined)).toBe("not_configured");
  });

  it("maps a configured service whose credential cannot be decrypted to unreadable", () => {
    expect(serviceState({ configured: true, unreadable: true })).toBe("unreadable");
  });

  it("maps an unreadable credential over a downstream error", () => {
    expect(serviceState({ configured: true, unreadable: true, error: "unreachable" })).toBe(
      "unreadable",
    );
  });

  it("maps a configured service with a downstream error to error", () => {
    expect(serviceState({ configured: true, error: "http_500" })).toBe("error");
  });

  it("maps an explicit unreadable: false to connected", () => {
    expect(serviceState({ configured: true, unreadable: false })).toBe("connected");
  });
});
