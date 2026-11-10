// @vitest-environment jsdom
//
// The Deploys page tab bar follows the WAI-ARIA tabs pattern: the tablist has
// `role="tablist"`, the selected tab is the only one in the tab order
// (tabIndex 0, the rest -1), ArrowLeft/ArrowRight move selection AND focus with
// wrap-around, Home/End jump to the first/last tab, the selected tab's `aria-controls`
// points at the visible tabpanel id, and that panel is labelled by the tab
// (`aria-labelledby`). Before the change every tab was tabbable with no arrow
// keys.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

async function renderTabs() {
  render(
    <ToastProvider>
      <DeploysPage />
    </ToastProvider>,
  );
  const tablist = await screen.findByRole("tablist", { name: "Deployment sections" });
  const tabs = screen.getAllByRole("tab");
  return { tablist, tabs };
}

function selected() {
  return screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")!;
}

/** Returns false when the handler called preventDefault (fireEvent semantics). */
function press(key: string) {
  const active = document.activeElement as HTMLElement;
  return fireEvent.keyDown(active, { key });
}

/** Model "Tab landed on the selected tab": focus the single tabbable tab. */
function focusSelectedTab() {
  selected().focus();
}

describe("Deploys tab keyboard pattern", () => {
  it("has a named tablist with tabs in order", async () => {
    const { tabs } = await renderTabs();
    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, "").trim())).toEqual([
      "Servers",
      "Applications",
      "History",
    ]);
  });

  it("puts exactly one tab in the tab order, the selected one", async () => {
    const { tabs } = await renderTabs();
    const inOrder = tabs.filter((t) => t.getAttribute("tabindex") === "0");
    expect(inOrder).toHaveLength(1);
    expect(inOrder[0]).toBe(tabs[0]); // servers selected by default
    expect(inOrder[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs.slice(1).every((t) => t.getAttribute("tabindex") === "-1")).toBe(true);
  });

  it("ArrowRight moves selection and focus, wrapping at the end", async () => {
    await renderTabs();
    focusSelectedTab();
    press("ArrowRight"); // -> Applications
    await waitFor(() => expect(selected().textContent).toMatch(/Applications/));
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Applications/ }));
    press("ArrowRight"); // -> History
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /History/ })));
    press("ArrowRight"); // wraps -> Servers
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Servers/ })));
    expect(selected().textContent).toMatch(/Servers/);
  });

  it("ArrowLeft moves backwards and wraps at the start", async () => {
    await renderTabs();
    focusSelectedTab();
    press("ArrowLeft"); // from servers, wraps -> History
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /History/ })));
    expect(selected().textContent).toMatch(/History/);
    press("ArrowLeft"); // -> Applications
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Applications/ })));
  });

  it("End goes to the last tab and Home to the first", async () => {
    await renderTabs();
    focusSelectedTab();
    press("End");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /History/ })));
    expect(selected().textContent).toMatch(/History/);
    press("Home");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Servers/ })));
    expect(selected().textContent).toMatch(/Servers/);
  });

  it("the selected tab controls the visible labelled tabpanel", async () => {
    const { tabs } = await renderTabs();
    const serversTab = tabs[0];
    const panel = screen.getByRole("tabpanel");
    expect(serversTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", serversTab.id);
    // Only one panel is mounted at a time and it is the controlled one.
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    // The panel is a tab stop of its own (WAI-ARIA tabs pattern).
    expect(panel).toHaveAttribute("tabindex", "0");
  });

  it("ArrowLeft, ArrowRight, Home and End prevent the default so the page does not scroll", async () => {
    await renderTabs();
    focusSelectedTab();
    for (const key of ["ArrowRight", "ArrowLeft", "End", "Home"]) {
      expect(press(key), key).toBe(false);
    }
    // Other keys keep their default.
    expect(press("a")).toBe(true);
  });
});
