import { describe, it, expect } from "vitest";
import {
  buildAuthorizationUrl,
  generateState,
} from "../src/services/github-oauth.js";

describe("github-oauth URL building", () => {
  it("includes client_id, redirect_uri, state, and required scopes", () => {
    const url = buildAuthorizationUrl(
      {
        clientId: "iv1.abc",
        clientSecret: "shhh",
        redirectUri: "https://pilot.example/api/oauth/github/callback",
      },
      "deadbeef",
    );

    expect(url).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(url).toContain("client_id=iv1.abc");
    expect(url).toContain("state=deadbeef");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fpilot.example%2Fapi%2Foauth%2Fgithub%2Fcallback");
    // repo + workflow are both required: workflow lets the token push
    // scaffolds containing .github/workflows/* (project-forge publish).
    expect(url).toContain("scope=read%3Auser+read%3Aorg+repo+workflow");
  });

  it("never leaks the clientSecret into the authorization URL", () => {
    const url = buildAuthorizationUrl(
      {
        clientId: "id",
        clientSecret: "top-secret-xyz",
        redirectUri: "https://x/callback",
      },
      "s",
    );
    expect(url).not.toContain("top-secret-xyz");
    expect(url).not.toContain("client_secret");
  });
});

describe("generateState", () => {
  it("returns a 32-char hex string", () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different values across calls", () => {
    const set = new Set(Array.from({ length: 10 }, () => generateState()));
    expect(set.size).toBe(10);
  });
});
