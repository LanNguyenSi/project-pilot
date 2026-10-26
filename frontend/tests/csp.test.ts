import { describe, expect, it } from "vitest";
import { buildCsp } from "../src/lib/csp";

function directive(csp: string, name: string): string {
  const found = csp.split("; ").find((d) => d === name || d.startsWith(`${name} `));
  if (!found) throw new Error(`directive ${name} missing from ${csp}`);
  return found;
}

function connectSrc(env: { NEXT_PUBLIC_API_URL?: string; NEXT_PUBLIC_DEPSIGHT_URL?: string }) {
  return directive(buildCsp(env), "connect-src");
}

describe("buildCsp connect-src", () => {
  it("adds the default API origin when NEXT_PUBLIC_API_URL is unset", () => {
    expect(connectSrc({})).toBe("connect-src 'self' http://localhost:3001");
  });

  it("adds the origin when NEXT_PUBLIC_API_URL is the dev value", () => {
    expect(connectSrc({ NEXT_PUBLIC_API_URL: "http://localhost:3001" })).toBe(
      "connect-src 'self' http://localhost:3001",
    );
  });

  it("reduces a trailing-slash URL to its origin", () => {
    expect(connectSrc({ NEXT_PUBLIC_API_URL: "https://project-pilot.opentriologue.ai/" })).toBe(
      "connect-src 'self' https://project-pilot.opentriologue.ai",
    );
  });

  it("drops the path of a URL", () => {
    expect(connectSrc({ NEXT_PUBLIC_API_URL: "http://api.local:8080/v1" })).toBe(
      "connect-src 'self' http://api.local:8080",
    );
  });

  it("falls back to the default for an empty string (same || as api.ts)", () => {
    expect(connectSrc({ NEXT_PUBLIC_API_URL: "" })).toBe(
      "connect-src 'self' http://localhost:3001",
    );
  });

  it("keeps only 'self' for an unparseable value and does not throw", () => {
    expect(connectSrc({ NEXT_PUBLIC_API_URL: "not a url" })).toBe("connect-src 'self'");
  });

  it("keeps only 'self' for a value without an http(s) scheme", () => {
    expect(connectSrc({ NEXT_PUBLIC_API_URL: "localhost:3001" })).toBe("connect-src 'self'");
    expect(connectSrc({ NEXT_PUBLIC_API_URL: "file:///tmp/api" })).toBe("connect-src 'self'");
  });
});

describe("buildCsp other directives", () => {
  it("keeps every other directive identical to the pre-connect-src CSP, with defaults", () => {
    expect(buildCsp({})).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self' http://localhost:3001",
        "frame-src 'self' https://depsight.opentriologue.ai",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  });

  it("uses NEXT_PUBLIC_DEPSIGHT_URL in frame-src", () => {
    expect(
      directive(buildCsp({ NEXT_PUBLIC_DEPSIGHT_URL: "http://depsight.local:4000" }), "frame-src"),
    ).toBe("frame-src 'self' http://depsight.local:4000");
  });
});
