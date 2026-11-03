// @vitest-environment jsdom
//
// The login page offers "Continue with GitHub" only when the backend reports
// GitHub OAuth as configured (GET /api/oauth/config -> {github: true}). It
// fails closed: hidden while loading and when the request fails or answers
// anything but `github: true`; email/password sign-in works in every case.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import LoginPage from "@/app/login/page";

function mockConfig(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function settled(fetchMock: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  // let the promise chain resolve
  await new Promise((r) => setTimeout(r, 0));
}

describe("login page GitHub button", () => {
  it("shows the button when github is true", async () => {
    mockConfig(() => json({ github: true }));
    render(<LoginPage />);
    expect(await screen.findByRole("link", { name: /continue with github/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/oauth/github/start"),
    );
  });

  it("hides the button when github is false", async () => {
    const f = mockConfig(() => json({ github: false }));
    render(<LoginPage />);
    await settled(f);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in", pressed: true })).toBeInTheDocument();
  });

  it("hides the button while the request is pending", () => {
    mockConfig(() => new Promise<Response>(() => {}));
    render(<LoginPage />);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
  });

  it("hides the button when the request fails (network error)", async () => {
    const f = mockConfig(() => Promise.reject(new Error("down")));
    render(<LoginPage />);
    await settled(f);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("hides the button when the backend answers 503", async () => {
    const f = mockConfig(() => json({ error: "x" }, 503));
    render(<LoginPage />);
    await settled(f);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
  });

  it("hides the button for a non-boolean answer", async () => {
    const f = mockConfig(() => json({ github: "yes" }));
    render(<LoginPage />);
    await settled(f);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
  });
});
