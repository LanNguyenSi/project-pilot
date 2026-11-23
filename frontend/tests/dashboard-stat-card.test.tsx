// @vitest-environment jsdom
//
// Dashboard error state: a stat card whose service is configured but could
// not be reached (error) shows the readable word "Unavailable" on the value
// line instead of the faint middle dot, and never the backend's error string.
// The hint cards at the bottom name the services: "Not configured: <labels>"
// for unconfigured services and "Could not reach: <labels>" for error ones.
// A connected card keeps the number, and a connected card without a value
// keeps the middle dot (repo convention for a single missing value).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "audit@example.test", name: "Audit User" },
    loading: false,
  }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  API_URL: "",
  ApiError: class ApiError extends Error {},
}));

import DashboardPage from "@/app/(app)/dashboard/page";

/** Summary where agent-tasks is in the error state, deploy-panel is not configured. */
const errorSummary = {
  services: {
    "project-forge": { configured: true, projectCount: 3 },
    "agent-tasks": { configured: true, error: "agent-tasks responded 502 (upstream unavailable)" },
    "deploy-panel": { configured: false },
  },
};

/** Summary where every service is configured and answers. */
const allConnectedSummary = {
  services: {
    "project-forge": { configured: true, projectCount: 3 },
    "agent-tasks": { configured: true, projectCount: 3, claimableCount: 7 },
    "deploy-panel": { configured: true, serverCount: 3, onlineCount: 2, appCount: null },
  },
};

async function renderWith(summary: unknown) {
  apiFetch.mockImplementation(async () => summary);
  render(<DashboardPage />);
  return screen.findByText("Open Tasks");
}

const cardFor = (label: string) =>
  screen.getByText(label).closest("div.animate-fade-in") as HTMLElement;

beforeEach(() => apiFetch.mockReset());
afterEach(cleanup);

describe("dashboard error-state stat cards", () => {
  it("shows Unavailable and no middle dot on the cards of the errored service", async () => {
    await renderWith(errorSummary);
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    for (const label of ["Projects", "Open Tasks"]) {
      const card = cardFor(label);
      expect(card.textContent).toContain("Unavailable");
      expect(card.textContent).not.toContain("·");
      expect(card.textContent).not.toContain("502");
    }
  });

  it("shows the number on a connected card and keeps the dot for a null value", async () => {
    await renderWith(allConnectedSummary);
    expect(cardFor("Open Tasks").textContent).toContain("7");
    expect(cardFor("Servers").textContent).toContain("2/3");
    expect(cardFor("Apps").textContent).toContain("·");
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("renders Unavailable smaller and in the secondary colour, not tertiary", async () => {
    await renderWith(errorSummary);
    const word = screen.getAllByText("Unavailable")[0];
    expect(word).toHaveClass("text-content-secondary", "text-base", "font-medium");
    expect(word).not.toHaveClass("text-content-tertiary");
  });

  it("shows the word Not set, not the dot, on a not-configured card", async () => {
    await renderWith(errorSummary);
    for (const label of ["Servers", "Apps"]) {
      const card = cardFor(label);
      expect(card.textContent).toContain("Not set");
      expect(card.textContent).not.toContain("·");
    }
    const word = screen.getAllByText("Not set")[0];
    expect(word).toHaveClass("text-content-secondary", "text-base", "font-medium");
  });

  it("lets the card header row wrap so a long label and the badge never overflow", async () => {
    await renderWith(errorSummary);
    const row = screen.getByText("Servers").parentElement as HTMLElement;
    expect(row).toHaveClass("flex-wrap", "gap-2");
  });
});

describe("dashboard hint cards", () => {
  it("names the services in both hint cards", async () => {
    await renderWith(errorSummary);
    expect(screen.getByText(/Not configured: Deploy Panel\./)).toBeInTheDocument();
    expect(screen.getByText(/Could not reach: Agent Tasks\./)).toBeInTheDocument();
    expect(screen.getByText("Check the service or its token in Settings")).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("names Project Forge when its token is missing", async () => {
    await renderWith({
      services: {
        "project-forge": { configured: false },
        "agent-tasks": { configured: true, projectCount: 3, claimableCount: 7 },
        "deploy-panel": { configured: false },
      },
    });
    expect(screen.getByText(/Not configured: Project Forge, Deploy Panel\./)).toBeInTheDocument();
    expect(screen.queryByText(/Could not reach: /)).not.toBeInTheDocument();
  });

  it("renders neither hint card when every service is connected", async () => {
    await renderWith(allConnectedSummary);
    expect(screen.queryByText(/Not configured: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not reach: /)).not.toBeInTheDocument();
  });
});
