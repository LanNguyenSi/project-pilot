import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/config/index.js", () => ({
  config: { AGENT_TASKS_URL: "https://agent-tasks.test" },
}));

vi.mock("../src/services/credentials.js", () => ({
  getCredential: vi.fn().mockResolvedValue("tasks-token"),
}));

import { agentTasksRequest } from "../src/services/agent-tasks-client.js";

describe("agentTasksRequest — upstream timeout handling", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("returns {ok:false, status:504, error:'Agent Tasks timed out'} when AbortSignal.timeout() rejects with a TimeoutError DOMException", async () => {
    // Real Node 26 message for an AbortSignal.timeout() rejection.
    const timeoutErr = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(timeoutErr);

    const result = await agentTasksRequest("user-1", "/api/projects/available");

    expect(result).toEqual({ ok: false, error: "Agent Tasks timed out", status: 504 });
  });

  it("returns {ok:false, status:502, error:'Agent Tasks unreachable'} on a generic network error", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await agentTasksRequest("user-1", "/api/projects/available");

    expect(result).toEqual({ ok: false, error: "Agent Tasks unreachable", status: 502 });
  });
});
