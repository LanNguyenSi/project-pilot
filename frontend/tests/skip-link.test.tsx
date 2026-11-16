// @vitest-environment jsdom
//
// The AppShell skip link and main landmark: the skip link is the first
// focusable element on every page (the sidebar used to be), it points at the
// main landmark's id, and main itself has that id, tabIndex -1 and an
// accessible name so it cannot collide with the unnamed main inside the
// same-origin /security iframe (axe landmark-unique).
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/layout/TopBar", () => ({
  TopBar: () => <button type="button">menu</button>,
}));
vi.mock("@/components/layout/Sidebar", () => ({
  Sidebar: () => <a href="#side">Tasks</a>,
}));

import { AppShell } from "@/components/layout/AppShell";

afterEach(cleanup);

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe("AppShell skip link and main landmark", () => {
  it("the skip link is the first focusable element and targets the main landmark", () => {
    const { container } = render(<AppShell>content</AppShell>);
    const [first] = Array.from(container.querySelectorAll(FOCUSABLE));
    expect(first?.tagName).toBe("A");
    expect(first).toHaveTextContent("Skip to main content");
    expect(first).toHaveAttribute("href", `#${screen.getByRole("main").id}`);
  });

  it("the main landmark has the id, tabIndex -1 and an accessible name", () => {
    render(<AppShell>content</AppShell>);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main.tabIndex).toBe(-1);
    expect(main).toHaveAccessibleName("Content");
  });
});
