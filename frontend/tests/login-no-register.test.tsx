// @vitest-environment jsdom
//
// Password sign-up is closed on the backend (POST /api/auth/register answers
// 403), so the login page offers no sign-up form that could only fail: no
// Register control, no name field, and a submit that only ever calls the login
// endpoint.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import LoginPage from "@/app/login/page";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/oauth/config")) {
      return new Response(JSON.stringify({ github: false }), { status: 200 });
    }
    return new Response(JSON.stringify({ user: { id: "u1" } }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("login page without sign-up", () => {
  it("has no Register control and no name field", async () => {
    stubFetch();
    render(<LoginPage />);
    expect(screen.queryByRole("button", { name: /register/i })).toBeNull();
    expect(screen.queryByText(/create your account/i)).toBeNull();
    expect(screen.queryByLabelText(/name/i)).toBeNull();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("submits to the login endpoint only", async () => {
    const fetchMock = stubFetch();
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/api/auth/login"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/auth/register"))).toBe(false);
  });
});
