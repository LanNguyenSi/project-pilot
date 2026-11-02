// @vitest-environment jsdom
//
// Layout contracts that keep the task toolbar inside a 390 px viewport and the
// small controls at 24x24 px or more (WCAG 2.2 SC 2.5.8). jsdom has no layout,
// so the Tailwind classes that produce the behaviour are pinned.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

import { ToastProvider } from "@/components/ui/Toast";
import { TopBar } from "@/components/layout/TopBar";
import ProjectTasksPage from "@/app/(app)/tasks/[projectId]/page";
import DeploysPage from "@/app/(app)/deploys/page";

beforeEach(() => apiFetch.mockReset());
afterEach(cleanup);

function classes(el: HTMLElement) {
  return el.className.split(/\s+/);
}

describe("task detail toolbar", () => {
  beforeEach(() => {
    apiFetch.mockImplementation(async (url: string) =>
      url === "/api/tasks/projects"
        ? { projects: [{ id: "p1", name: "P", slug: "p", description: "" }] }
        : { tasks: [{ id: "k1", title: "T", status: "open", priority: "MEDIUM", createdAt: "2026-01-01T00:00:00Z" }] },
    );
  });

  it("stacks below sm and rows from sm up", async () => {
    render(<ProjectTasksPage />);
    const toolbar = (await screen.findByRole("toolbar", { name: "Filter by status" }))
      .parentElement!.parentElement!;
    const c = classes(toolbar);
    expect(c).toContain("flex-col");
    expect(c).toContain("sm:flex-row");
    expect(c).toContain("sm:justify-between");
  });

  it("lets the filter group and its buttons wrap", async () => {
    render(<ProjectTasksPage />);
    const buttons = await screen.findByRole("toolbar", { name: "Filter by status" });
    expect(classes(buttons)).toContain("flex-wrap");
    expect(classes(buttons.parentElement!)).toContain("flex-wrap");
  });

  it("keeps the List/Board toggle in the toolbar", async () => {
    render(<ProjectTasksPage />);
    const toggle = (await screen.findByRole("button", { name: "Board view" })).parentElement!;
    expect(classes(toggle)).toContain("self-start");
    expect(screen.getByRole("button", { name: "List view" }).parentElement).toBe(toggle);
  });
});

describe("touch targets of at least 24x24 px", () => {
  it("burger button has padding that grows the 20 px icon to 28 px without shifting layout", () => {
    render(<TopBar onMenuClick={() => {}} />);
    const c = classes(screen.getByRole("button", { name: "Open navigation" }));
    expect(c).toContain("p-1");
    expect(c).toContain("-m-1");
  });

  it("server card Test and Delete buttons have a 24 px minimum hit area", async () => {
    apiFetch.mockImplementation(async (url?: string) => {
      if (!url) return {};
      if (url.startsWith("/api/deploy/servers"))
        return { servers: [{ id: "s1", name: "srv", host: "h", status: "online", appCount: 1 }] };
      if (url.startsWith("/api/deploy/apps")) return { apps: [] };
      if (url.startsWith("/api/deploy/history")) return { deploys: [], total: 0 };
      return {};
    });
    render(<ToastProvider><DeploysPage /></ToastProvider>);
    fireEvent.click(await screen.findByRole("tab", { name: /servers/i }));
    for (const name of ["Test connection to srv", "Delete srv"]) {
      const c = classes(await screen.findByRole("button", { name }));
      expect(c).toContain("min-h-6");
      expect(c).toContain("min-w-6");
      expect(c).toContain("-my-1");
    }
  });
});
