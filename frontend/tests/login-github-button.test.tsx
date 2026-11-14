// @vitest-environment jsdom
//
// The login page offers "Continue with GitHub" only when the backend reports
// GitHub OAuth as configured (GET /api/oauth/config -> {github: true}). It
// fails closed: hidden while loading and when the request fails or answers
// anything but `github: true`; email/password sign-in works in every case.
// While the request is pending the button and its "or" divider are held open by
// an invisible, aria-hidden placeholder so the centred card does not jump when
// the answer arrives; a "not configured" answer leaves nothing behind.
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

/**
 * The height placeholder rendered while the config request is pending: the same
 * block the configured answer renders (call to action plus "or" divider), held
 * open so the centred card does not jump. Identified by its `invisible` class,
 * the only such element on the page.
 */
function placeholder(container: HTMLElement) {
  return container.querySelector("div.invisible");
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
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("hides the button while the request is pending", () => {
    mockConfig(() => new Promise<Response>(() => {}));
    render(<LoginPage />);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
  });

  it("holds the button height with a non-focusable placeholder while pending", () => {
    mockConfig(() => new Promise<Response>(() => {}));
    const { container } = render(<LoginPage />);
    const ph = placeholder(container);
    expect(ph).not.toBeNull();
    expect(ph).toHaveAttribute("aria-hidden", "true");
    // A plain div, never wrapped in a link or button, with no tabindex: nothing
    // to tab to while the request is in flight.
    expect(ph!.tagName).toBe("DIV");
    expect(ph).not.toHaveAttribute("tabindex");
    expect(ph!.closest("a, button")).toBeNull();
    // The whole block is held open, not just the button: the "or" divider that
    // appears with it is inside the placeholder too.
    expect(ph!.textContent).toContain("Continue with GitHub");
    expect(ph!.textContent).toContain("or");
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
  });

  it("renders the button and drops the placeholder once configured", async () => {
    mockConfig(() => json({ github: true }));
    const { container } = render(<LoginPage />);
    await screen.findByRole("link", { name: /continue with github/i });
    expect(placeholder(container)).toBeNull();
  });

  it("renders neither button nor placeholder once the answer is not configured", async () => {
    const f = mockConfig(() => json({ github: false }));
    const { container } = render(<LoginPage />);
    await settled(f);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
    expect(placeholder(container)).toBeNull();
  });

  it("hides the button when the request fails (network error)", async () => {
    const f = mockConfig(() => Promise.reject(new Error("down")));
    const { container } = render(<LoginPage />);
    await settled(f);
    expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
    expect(placeholder(container)).toBeNull();
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
