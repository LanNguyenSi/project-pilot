// @vitest-environment jsdom
//
// Heading hierarchy on the Forge, Settings and Deploys pages: the shared
// PageHeader renders the page <h1>, and the card titles directly below it used
// to be <h3>, an h1-to-h3 jump that axe reports as `heading-order`. They are
// now <h2>, so the levels are consecutive (h1 then h2, no skipped level) on
// every page, with no <h3> left in the page. /login had no heading at all
// (axe `page-has-heading-one`); the wordmark is now the page's single <h1>.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  API_URL: "",
  ApiError: class ApiError extends Error {},
}));

import { ToastProvider } from "@/components/ui/Toast";
import ForgePage from "@/app/(app)/forge/page";
import SettingsPage from "@/app/(app)/settings/page";
import DeploysPage from "@/app/(app)/deploys/page";
import LoginPage from "@/app/login/page";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url?: string) => {
    if (!url) return {};
    if (url.startsWith("/api/forge/projects"))
      return { projects: [{ id: "p1", repoUrl: "https://github.com/o/r", projectName: "Alpha", createdAt: "2026-01-01T00:00:00Z" }] };
    if (url.startsWith("/api/tasks/projects")) return { projects: [] };
    if (url.startsWith("/api/credentials")) return { credentials: [] };
    if (url.startsWith("/api/deploy/servers"))
      return { servers: [{ id: "s1", name: "vps-01", host: "1.2.3.4", status: "online", appCount: 0 }] };
    if (url.startsWith("/api/deploy/apps")) return { apps: [] };
    if (url.startsWith("/api/deploy/history")) return { deploys: [], total: 0 };
    if (url.startsWith("/api/oauth/config")) return { github: false };
    return {};
  });
});
afterEach(cleanup);

/** Heading levels in document order (H1 -> 1, H2 -> 2, ...). */
function headingLevels(): number[] {
  return screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
}

/** A valid heading outline starts at h1 and never skips a level going down. */
function assertConsecutiveFromH1(levels: number[]) {
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
  }
}

describe("heading hierarchy", () => {
  it("Forge: h1 then consecutive h2 card titles, no h3", async () => {
    render(
      <ToastProvider>
        <ForgePage />
      </ToastProvider>,
    );
    await screen.findByRole("heading", { level: 1, name: "Forge" });
    const levels = headingLevels();
    expect(levels).toEqual([1, 2]);
    expect(levels).not.toContain(3);
    assertConsecutiveFromH1(levels);
  });

  it("Settings: h1 then consecutive h2 card titles, no h3", async () => {
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
    );
    await screen.findByRole("heading", { level: 1, name: "Settings" });
    const levels = headingLevels();
    expect(levels).toEqual([1, 2, 2, 2]);
    expect(levels).not.toContain(3);
    assertConsecutiveFromH1(levels);
  });

  it("Deploys: h1 then consecutive h2 card titles, no h3", async () => {
    render(
      <ToastProvider>
        <DeploysPage />
      </ToastProvider>,
    );
    await screen.findByRole("heading", { level: 1, name: "Deploys" });
    const levels = headingLevels();
    expect(levels).toEqual([1, 2]);
    expect(levels).not.toContain(3);
    assertConsecutiveFromH1(levels);
  });

  it("Login: exactly one h1 and it is the wordmark", async () => {
    render(<LoginPage />);
    const h1s = await screen.findAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("project-pilot");
    // The wordmark is the only heading, so there is nothing to jump over.
    expect(headingLevels()).toEqual([1]);
  });
});
