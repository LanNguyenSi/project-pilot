// @vitest-environment jsdom
//
// Settings "Sessions" card: shows the active count, ends the other sessions
// behind a confirm, toasts the number, and stays disabled when only the current
// session is active.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiFetch = vi.fn();
const toast = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import SettingsPage from "@/app/(app)/settings/page";

let active = 3;
let revokeFails = false;

beforeEach(() => {
  apiFetch.mockReset();
  toast.mockReset();
  active = 3;
  revokeFails = false;
  apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/credentials") return { credentials: [] };
    if (url === "/api/auth/sessions") return { active, current: true };
    if (url === "/api/auth/sessions/revoke-others") {
      if (revokeFails) throw new Error("boom");
      active = 1;
      return { ok: true, revoked: 2 };
    }
    return {};
  });
});
afterEach(cleanup);

describe("Sessions card", () => {
  it("shows the active count", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/3 active sessions/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out other sessions" })).toBeEnabled();
  });

  it("disables the button when only the current session is active", async () => {
    active = 1;
    render(<SettingsPage />);
    expect(await screen.findByText(/1 active session/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out other sessions" })).toBeDisabled();
  });

  it("asks for confirmation, revokes, toasts the number and reloads the count", async () => {
    render(<SettingsPage />);
    await screen.findByText(/3 active sessions/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    expect(apiFetch).not.toHaveBeenCalledWith("/api/auth/sessions/revoke-others", expect.anything());
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/sessions/revoke-others", { method: "POST" }),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Signed out 2 other sessions", variant: "success" }),
    );
    expect(await screen.findByText(/1 active session/)).toBeInTheDocument();
  });

  it("toasts an error when revoking fails", async () => {
    revokeFails = true;
    render(<SettingsPage />);
    await screen.findByText(/3 active sessions/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "boom", variant: "error" }));
  });
});
