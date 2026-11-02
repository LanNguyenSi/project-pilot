// @vitest-environment jsdom
//
// Accessible names and focus handling: Select without a visible label, the five
// unlabelled Select call sites, the settings token inputs, the mobile
// navigation overlay and the toast live region.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ projectId: "p1" }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/layout/Breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/components/TaskDetailPanel", () => ({ TaskDetailPanel: () => null }));
vi.mock("@/components/deploys/InstallRelayWizard", () => ({ InstallRelayWizard: () => null }));

import { Select } from "@/components/ui/Select";
import { ToastProvider } from "@/components/ui/Toast";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import TasksPage from "@/app/(app)/tasks/page";
import ProjectTasksPage from "@/app/(app)/tasks/[projectId]/page";
import DeploysPage from "@/app/(app)/deploys/page";
import SettingsPage from "@/app/(app)/settings/page";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  // Run the focus trap's requestAnimationFrame synchronously.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(cleanup);

const OPTS = [{ value: "a", label: "Alpha" }];

// Compile-time guard, never rendered: a Select without label or aria-label
// must stay a type error (typecheck:test fails on an unused @ts-expect-error).
export function NamelessSelectIsATypeError() {
  // @ts-expect-error a Select needs a label or an aria-label
  return <Select options={OPTS} value="a" onChange={() => {}} />;
}

describe("Select accessible name", () => {
  it("uses aria-label when there is no visible label", () => {
    render(<Select options={OPTS} value="a" onChange={() => {}} aria-label="Sort tasks" />);
    expect(screen.getByRole("combobox", { name: "Sort tasks" })).toBeInTheDocument();
  });

  it("uses the visible label when both are given (label wins)", () => {
    render(<Select options={OPTS} value="a" onChange={() => {}} label="Team" aria-label="ignored" />);
    expect(screen.getByRole("combobox", { name: "Team" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "ignored" })).toBeNull();
  });

  it("names the listbox from aria-label too", () => {
    render(<Select options={OPTS} value="a" onChange={() => {}} aria-label="Sort tasks" />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox", { name: "Sort tasks" })).toBeInTheDocument();
  });
});

describe("unlabelled Select call sites are named", () => {
  it("tasks: sync picker with several teams", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url === "/api/tasks/projects"
        ? { projects: [] }
        : { teams: [{ id: "t1", name: "One", slug: "one" }, { id: "t2", name: "Two", slug: "two" }] },
    );
    render(<ToastProvider><TasksPage /></ToastProvider>);
    expect(await screen.findByRole("combobox", { name: "Sync from GitHub" })).toBeInTheDocument();
  });

  it("project tasks: sort", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url === "/api/tasks/projects"
        ? { projects: [{ id: "p1", name: "P", slug: "p", description: "" }] }
        : { tasks: [{ id: "k1", title: "T", status: "open", priority: "MEDIUM", createdAt: "2026-01-01T00:00:00Z" }] },
    );
    render(<ProjectTasksPage />);
    expect(await screen.findByRole("combobox", { name: "Sort tasks" })).toBeInTheDocument();
  });

  it("deploys: server, app and status history filters", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/deploy/servers")) return { servers: [] };
      if (url.startsWith("/api/deploy/apps")) return { apps: [] };
      if (url.startsWith("/api/deploy/history")) return { deploys: [], total: 0 };
      return { projects: [] };
    });
    render(<ToastProvider><DeploysPage /></ToastProvider>);
    fireEvent.click(await screen.findByRole("tab", { name: /history/i }));
    expect(await screen.findByRole("combobox", { name: "Filter by server" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by app" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toBeInTheDocument();
  });
});

describe("settings token inputs", () => {
  it("each token field has a name", async () => {
    apiFetch.mockResolvedValue({ credentials: [] });
    render(<ToastProvider><SettingsPage /></ToastProvider>);
    expect(await screen.findByLabelText("Project Forge token")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent Tasks token")).toBeInTheDocument();
    expect(screen.getByLabelText("Deploy Panel token")).toBeInTheDocument();
  });
});

describe("toast container", () => {
  it("is a status live region without a prohibited aria-label", () => {
    const { container } = render(<ToastProvider>x</ToastProvider>);
    const region = container.querySelector("[aria-live]") as HTMLElement;
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "false");
    expect(region).not.toHaveAttribute("aria-label");
  });
});

describe("mobile navigation overlay", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <TopBar onMenuClick={() => setOpen(true)} />
        <Sidebar collapsed={false} onToggle={() => {}} mobileOpen={open} onMobileClose={() => setOpen(false)} />
        <button>outside</button>
      </>
    );
  }

  function openNav() {
    const burger = screen.getByRole("button", { name: "Open navigation" });
    burger.focus();
    fireEvent.click(burger);
    return burger;
  }

  it("is a named modal dialog and focuses its first link", () => {
    render(<Harness />);
    openNav();
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const first = dialog.querySelector("a") as HTMLElement;
    expect(document.activeElement).toBe(first);
  });

  it("wraps Tab at both ends and has no hidden collapse button inside", () => {
    render(<Harness />);
    openNav();
    const dialog = screen.getByRole("dialog");
    const links = dialog.querySelectorAll("a");
    const first = links[0] as HTMLElement;
    const last = links[links.length - 1] as HTMLElement;
    expect(dialog.querySelector("button")).toBeNull();
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape and returns focus to the burger", () => {
    render(<Harness />);
    const burger = openNav();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(burger);
  });

  it("returns focus to the burger when the backdrop closes it", async () => {
    render(<Harness />);
    const burger = openNav();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(dialog.querySelector('[aria-hidden="true"].absolute') as HTMLElement);
    await waitFor(() => expect(document.activeElement).toBe(burger));
  });

  it("does not move focus to the burger on first render", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(document.body);
  });
});
