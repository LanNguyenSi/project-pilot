// @vitest-environment jsdom
//
// The Deploys page header at 390 px: "Install relay" and "Add Server" shared one
// row with the "Deploys" h1 in the shared PageHeader, so the buttons overlapped
// the title. The header now stacks its actions below the title and returns to a
// single row from the `sm` breakpoint up, the pattern the task list toolbar
// already uses. jsdom has no layout, so the Tailwind classes that produce the
// behaviour are pinned (same approach as mobile-toolbar-touch-targets.test.tsx).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/deploys/InstallRelayWizard", () => ({ InstallRelayWizard: () => null }));

import { ToastProvider } from "@/components/ui/Toast";
import DeploysPage from "@/app/(app)/deploys/page";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url?: string) => {
    if (!url) return {};
    if (url.startsWith("/api/deploy/servers")) return { servers: [] };
    if (url.startsWith("/api/deploy/apps")) return { apps: [] };
    if (url.startsWith("/api/deploy/history")) return { deploys: [], total: 0 };
    return { projects: [] };
  });
});
afterEach(cleanup);

function classes(el: HTMLElement) {
  return el.className.split(/\s+/);
}

async function renderDeploys() {
  render(
    <ToastProvider>
      <DeploysPage />
    </ToastProvider>,
  );
  const h1 = await screen.findByRole("heading", { name: "Deploys", level: 1 });
  const header = h1.parentElement!.parentElement!;
  const actions = h1.parentElement!.nextElementSibling as HTMLElement;
  return { h1, header, actions };
}

describe("Deploys page header", () => {
  it("stacks the actions under the title and puts them back in one row from sm up", async () => {
    const { header } = await renderDeploys();
    const c = classes(header);
    expect(c).toContain("flex-col");
    expect(c).toContain("sm:flex-row");
    expect(c).toContain("sm:items-start");
    expect(c).toContain("sm:justify-between");
  });

  it("keeps the actions slot wrappable and only pinned to the row width from sm up", async () => {
    const { actions } = await renderDeploys();
    const c = classes(actions);
    expect(c).toContain("flex-wrap");
    expect(c).toContain("sm:shrink-0");
    // Both actions live in the stacked slot (the EmptyState below repeats the
    // "Add Server" label, so the query is scoped to the slot).
    const relay = within(actions).getByRole("button", { name: /install relay/i });
    expect(relay).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: /add server/i })).toBeInTheDocument();
    // The slot wraps, and so does the page's own action row inside it: the
    // outer slot has a single child, so only the inner row can break the two
    // buttons onto a second line.
    expect(classes(relay.parentElement!)).toContain("flex-wrap");
  });
});
