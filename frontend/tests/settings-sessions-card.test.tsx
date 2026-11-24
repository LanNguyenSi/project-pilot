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
let revoked = 2;
let sessionsMode: "ok" | "fail" | "pending" | "fail-after-revoke" = "ok";
let revokeDone = false;

beforeEach(() => {
  apiFetch.mockReset();
  toast.mockReset();
  active = 3;
  revokeFails = false;
  revoked = 2;
  sessionsMode = "ok";
  revokeDone = false;
  apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/credentials") return { credentials: [] };
    if (url === "/api/auth/sessions") {
      if (sessionsMode === "fail" || (sessionsMode === "fail-after-revoke" && revokeDone)) throw new Error("down");
      if (sessionsMode === "pending") return new Promise(() => {});
      return { active, current: true };
    }
    if (url === "/api/auth/sessions/revoke-others") {
      if (revokeFails) throw new Error("boom");
      active = 1;
      revokeDone = true;
      return { ok: true, revoked };
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

  it("closes the confirm dialog after a successful revoke", async () => {
    render(<SettingsPage />);
    await screen.findByText(/3 active sessions/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows a load error and keeps the button disabled when the count cannot be loaded", async () => {
    sessionsMode = "fail";
    render(<SettingsPage />);
    expect(await screen.findByText("Could not load the session count.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out other sessions" })).toBeDisabled();
  });

  it("keeps the button disabled while the count is still loading", async () => {
    sessionsMode = "pending";
    render(<SettingsPage />);
    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out other sessions" })).toBeDisabled();
  });

  it("uses the singular in the toast when one session was ended", async () => {
    revoked = 1;
    render(<SettingsPage />);
    await screen.findByText(/3 active sessions/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Signed out 1 other session", variant: "success" }),
    );
  });

  it("flags a failed reload after a successful revoke", async () => {
    sessionsMode = "fail-after-revoke";
    render(<SettingsPage />);
    await screen.findByText(/3 active sessions/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Could not load the session count.")).toBeInTheDocument();
  });

  it("blocks a second confirm click while the revoke is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    const base = apiFetch.getMockImplementation()!;
    apiFetch.mockImplementation((url: string, init?: unknown) =>
      url === "/api/auth/sessions/revoke-others"
        ? new Promise((r) => {
            release = r;
          })
        : base(url, init),
    );
    render(<SettingsPage />);
    await screen.findByText(/3 active sessions/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    const confirm = await screen.findByRole("button", { name: "Sign out" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    const posts = () =>
      apiFetch.mock.calls.filter((c) => c[0] === "/api/auth/sessions/revoke-others").length;
    await waitFor(() => expect(posts()).toBe(1));
    expect(posts()).toBe(1);
    release({ ok: true, revoked: 2 });
  });
});
