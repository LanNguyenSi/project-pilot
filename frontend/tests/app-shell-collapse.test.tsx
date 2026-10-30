// @vitest-environment jsdom
//
// AppShell's sidebar-collapsed flag: read from localStorage after hydration,
// written back on toggle. Runs under jsdom (see vitest.config.ts).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/layout/TopBar", () => ({ TopBar: () => null }));
vi.mock("@/components/layout/Sidebar", () => ({
  Sidebar: ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle}>
      {collapsed ? "collapsed" : "expanded"}
    </button>
  ),
}));

import { AppShell } from "@/components/layout/AppShell";

const KEY = "sidebar-collapsed";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AppShell collapsed flag", () => {
  it("starts expanded when nothing is stored", () => {
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("button")).toHaveTextContent("expanded");
  });

  it("starts collapsed when localStorage holds true", () => {
    localStorage.setItem(KEY, "true");
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("button")).toHaveTextContent("collapsed");
  });

  it("stays expanded for any stored value other than true", () => {
    localStorage.setItem(KEY, "false");
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("button")).toHaveTextContent("expanded");
  });

  it("toggles, persists each state and survives a remount", () => {
    const { unmount } = render(<AppShell>content</AppShell>);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveTextContent("collapsed");
    expect(localStorage.getItem(KEY)).toBe("true");
    fireEvent.click(button);
    expect(button).toHaveTextContent("expanded");
    expect(localStorage.getItem(KEY)).toBe("false");
    fireEvent.click(button);
    unmount();
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("button")).toHaveTextContent("collapsed");
  });

  it("server-renders the expanded layout even when true is stored", () => {
    localStorage.setItem(KEY, "true");
    const html = renderToString(<AppShell>content</AppShell>);
    expect(html).toContain("expanded");
    expect(html).not.toContain("collapsed");
  });
});
