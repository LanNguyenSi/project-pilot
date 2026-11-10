// @vitest-environment jsdom
//
// The forge wizard's step indicator (Configure / Preview / Publish) is a real
// ordered list labelled "Progress". The active step carries aria-current="step",
// a completed step's accessible name includes "completed" (an sr-only label,
// wired in via aria-labelledby) and its tick icon is aria-hidden. Previously it
// was a row of plain divs with an icon-only tick and no current-step signal.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { ToastProvider } from "@/components/ui/Toast";
import CreateProjectPage from "@/app/(app)/forge/create/page";

const preview = {
  projectName: "my-project",
  tasks: [],
  architectureOverview: "",
  fileTree: [],
  taskCount: 0,
  waveCount: 0,
};

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url?: string) => {
    if (url?.includes("capabilities")) return { enabled: false, features: {} };
    if (url?.includes("/api/forge/generate")) return { sessionId: "s1", preview };
    return {};
  });
});
afterEach(cleanup);

function renderWizard() {
  render(
    <ToastProvider>
      <CreateProjectPage />
    </ToastProvider>,
  );
}

describe("forge wizard headings", () => {
  it("with AI magic fill enabled, its card title follows the page h1 as an h2", async () => {
    apiFetch.mockImplementation(async (url?: string) => {
      if (url?.includes("capabilities")) return { enabled: true, features: { magicFill: true } };
      return {};
    });
    renderWizard();
    await screen.findByRole("heading", { name: "AI Magic Fill" });
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName.slice(1)));
    expect(levels).toEqual([1, 2]);
  });
});

describe("forge wizard stepper", () => {
  it("marks the active step with aria-current=step in an ordered list", async () => {
    renderWizard();
    const list = await screen.findByRole("list", { name: "Progress" });
    expect(list).toBeInTheDocument();
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAccessibleName("Configure");
    expect(items[0]).toHaveAttribute("aria-current", "step"); // Configure is active on the form
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(items[2]).not.toHaveAttribute("aria-current");
  });

  it("names a completed step after its label plus completed, with a hidden tick", async () => {
    renderWizard();
    await screen.findByRole("list", { name: "Progress" });
    // Advance to the Preview step so Configure is completed.
    fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "my-project" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "does a thing" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));

    const configure = await screen.findByRole("listitem", { name: "Configure completed" });
    expect(configure).not.toHaveAttribute("aria-current");
    // The tick icon inside the completed circle is not announced on its own.
    const icon = configure.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    // Preview is now the current step.
    expect(screen.getByRole("listitem", { name: "Preview" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("listitem", { name: "Publish" })).not.toHaveAttribute("aria-current");
  });
});
