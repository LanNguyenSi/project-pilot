// @vitest-environment jsdom
//
// Dashboard load failure: when the summary cannot be loaded (HTTP 500 or a
// network error) and no earlier data exists, the page says so instead of
// reading the missing summary as "not configured". A later poll failure keeps
// the last good data and says it is stale; a later success clears the notice.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
// One stable router object, like next/navigation: the page effect depends on it.
const router = { push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "audit@example.test", name: "Audit User" },
    loading: false,
  }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  API_URL: "",
  ApiError: class ApiError extends Error {},
}));

import DashboardPage from "@/app/(app)/dashboard/page";

const summary = {
  services: {
    "project-forge": { configured: true, projectCount: 3 },
    "agent-tasks": { configured: true, projectCount: 3, claimableCount: 7 },
    "deploy-panel": { configured: true, serverCount: 3, onlineCount: 2, appCount: 4 },
  },
};

class HttpError extends Error {
  status = 500;
}

beforeEach(() => {
  apiFetch.mockReset();
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("dashboard summary load failure without earlier data", () => {
  it.each([
    ["an HTTP 500", () => new HttpError("boom")],
    ["a network error", () => new TypeError("Failed to fetch")],
  ])("shows the error card and no not-configured claim on %s", async (_name, make) => {
    apiFetch.mockRejectedValue(make());
    render(<DashboardPage />);

    expect(await screen.findByText("Could not load the service summary")).toBeInTheDocument();
    expect(screen.getByText(/retries every 30 seconds/)).toBeInTheDocument();
    expect(screen.queryByText(/Not configured/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Not set")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Tasks")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("a 401 still redirects to login and shows no error card", async () => {
    apiFetch.mockRejectedValue(new Error("API error: 401"));
    render(<DashboardPage />);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Could not load the service summary")).not.toBeInTheDocument();
  });

  it("the retry button loads again and replaces the error card with the data", async () => {
    apiFetch.mockRejectedValueOnce(new HttpError("boom")).mockResolvedValue(summary);
    render(<DashboardPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Open Tasks")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the service summary")).not.toBeInTheDocument();
  });
});

describe("dashboard poll failure after a successful load", () => {
  it("keeps the last good data, says it is stale, and clears the notice on the next success", async () => {
    // Capture the 30 s poll callback and fire it by hand inside act().
    let poll: (() => void) | undefined;
    // Testing Library's own waitFor polling uses setInterval too, so only the
    // 30 s call is intercepted and everything else passes through.
    const realSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, "setInterval").mockImplementation(((cb: () => void, ms?: number) => {
      if (ms === 30_000) {
        poll = cb;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }
      return realSetInterval(cb, ms);
    }) as unknown as typeof setInterval);
    apiFetch
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(new HttpError("boom"))
      .mockResolvedValue(summary);
    render(<DashboardPage />);
    expect(await screen.findByText("Open Tasks")).toBeInTheDocument();
    expect(screen.queryByText(/latest refresh failed/)).not.toBeInTheDocument();

    await act(async () => poll?.());
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/latest refresh failed/)).toBeInTheDocument();
    expect(screen.getByText("Open Tasks")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the service summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/Not configured/i)).not.toBeInTheDocument();

    await act(async () => poll?.());
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/latest refresh failed/)).not.toBeInTheDocument();
    expect(screen.getByText("Open Tasks")).toBeInTheDocument();
  });
});
