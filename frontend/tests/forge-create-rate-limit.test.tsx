// @vitest-environment jsdom
//
// Forge create page: when magic fill is answered with the limiter's 429, the
// banner shows the human message (with the wait when Retry-After is readable),
// not the machine code "rate_limited". Uses the real apiFetch over a stubbed
// fetch so the 429 handling in api.ts is part of the path.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ToastProvider } from "@/components/ui/Toast";
import CreateProjectPage from "@/app/(app)/forge/create/page";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function triggerMagicFill(magicFillResponse: ReturnType<typeof jsonResponse>) {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).endsWith("/api/forge/ai-assist/capabilities")
      ? jsonResponse(200, { enabled: true, features: { magicFill: true } })
      : magicFillResponse,
  );
  render(
    <ToastProvider>
      <CreateProjectPage />
    </ToastProvider>,
  );
  const box = await screen.findByPlaceholderText(/A todo app with React/);
  fireEvent.change(box, { target: { value: "a todo app" } });
  fireEvent.click(screen.getByRole("button", { name: "Fill Form" }));
  return screen.findByRole("alert");
}

describe("forge create magic fill rate limit", () => {
  it("shows the limiter message with the wait, not the machine code", async () => {
    const alert = await triggerMagicFill(
      jsonResponse(
        429,
        { error: "rate_limited", message: "Too many requests. Please try again later." },
        { "Retry-After": "42" },
      ),
    );
    expect(alert).toHaveTextContent("Too many requests. Please try again later. Try again in 42 s.");
    expect(alert).not.toHaveTextContent("rate_limited");
  });

  it("shows the human message without a wait when Retry-After is not readable", async () => {
    const alert = await triggerMagicFill(
      jsonResponse(429, { error: "rate_limited", message: "Too many requests. Please try again later." }),
    );
    expect(alert).toHaveTextContent("Too many requests. Please try again later.");
    expect(alert).not.toHaveTextContent("Try again in");
    expect(alert).not.toHaveTextContent("rate_limited");
  });
});
