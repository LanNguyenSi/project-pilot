import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/credentials.js", () => ({
  upsertCredential: vi.fn().mockResolvedValue({}),
}));

import { registerUserWithAllModules } from "../src/services/module-registration.js";
import { upsertCredential } from "../src/services/credentials.js";

const upsert = vi.mocked(upsertCredential);

function mockFetchResponses(
  responses: Record<string, Response | { throw: Error }>,
): void {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    for (const [match, r] of Object.entries(responses)) {
      if (url.includes(match)) {
        if ("throw" in r) throw r.throw;
        return r;
      }
    }
    throw new Error(`unmatched URL: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("registerUserWithAllModules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores tokens for every module that returns a valid response", async () => {
    mockFetchResponses({
      "project-forge": jsonResponse(200, {
        apiToken: "forge-tok",
        userId: "u1",
        githubLogin: "lan",
      }),
      "agent-tasks": jsonResponse(200, {
        apiToken: "tasks-tok",
        userId: "u1",
        githubLogin: "lan",
      }),
      "deploy-panel": jsonResponse(200, {
        apiToken: "deploy-tok",
        userId: "u1",
        githubLogin: "lan",
      }),
    });

    const results = await registerUserWithAllModules("local-user-id", "gh-tok", "lan");

    expect(results.every((r) => r.ok)).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledWith(
      "local-user-id",
      "agent-tasks",
      "tasks-tok",
      "GitHub: lan",
    );
  });

  it("surfaces per-module failures without aborting the others", async () => {
    mockFetchResponses({
      "project-forge": { throw: new Error("ECONNREFUSED") },
      "agent-tasks": jsonResponse(200, {
        apiToken: "tasks-tok",
        userId: "u1",
        githubLogin: "lan",
      }),
      "deploy-panel": jsonResponse(503, { error: "upstream_unavailable" }),
    });

    const results = await registerUserWithAllModules("user", "gh", "lan");

    const forge = results.find((r) => r.service === "project-forge");
    const tasks = results.find((r) => r.service === "agent-tasks");
    const deploy = results.find((r) => r.service === "deploy-panel");

    expect(forge?.ok).toBe(false);
    expect(forge?.error).toBe("unreachable");
    expect(tasks?.ok).toBe(true);
    expect(deploy?.ok).toBe(false);
    expect(deploy?.error).toBe("http_503");

    // Only the successful module should have written a credential.
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      "user",
      "agent-tasks",
      "tasks-tok",
      expect.stringContaining("lan"),
    );
  });

  it("marks missing apiToken in response body as a failure", async () => {
    mockFetchResponses({
      "project-forge": jsonResponse(200, { userId: "u1", githubLogin: "lan" }),
      "agent-tasks": jsonResponse(200, {
        apiToken: "tasks-tok",
        userId: "u1",
        githubLogin: "lan",
      }),
      "deploy-panel": jsonResponse(200, {
        apiToken: "deploy-tok",
        userId: "u1",
        githubLogin: "lan",
      }),
    });

    const results = await registerUserWithAllModules("u", "gh", "lan");

    const forge = results.find((r) => r.service === "project-forge");
    expect(forge?.ok).toBe(false);
    expect(forge?.error).toBe("no_token_in_response");
    expect(upsert).toHaveBeenCalledTimes(2); // tasks + deploy only
  });

  it("does not leak the GitHub access-token in error payloads", async () => {
    mockFetchResponses({
      "project-forge": jsonResponse(500, {
        error: "internal",
        details: "accidentally logged gh-secret-token",
      }),
      "agent-tasks": jsonResponse(200, {
        apiToken: "x",
        userId: "u",
        githubLogin: "lan",
      }),
      "deploy-panel": jsonResponse(200, {
        apiToken: "y",
        userId: "u",
        githubLogin: "lan",
      }),
    });

    const results = await registerUserWithAllModules("u", "gh-secret-token", "lan");

    const forge = results.find((r) => r.service === "project-forge");
    // Error codes are opaque — no module response body surfaces back.
    expect(forge?.error).toBe("http_500");
    expect(JSON.stringify(results)).not.toContain("gh-secret-token");
  });
});
