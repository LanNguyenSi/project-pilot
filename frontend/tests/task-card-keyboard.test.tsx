// @vitest-environment jsdom
//
// Keyboard access on the project task page: cards open the detail panel with
// Enter and Space, focus returns to the card on close, the List/Board toggle
// exposes its state, and the project search input has a name.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ projectId: "p1" }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/TaskDetailPanel", () => ({
  TaskDetailPanel: ({ taskId, onClose }: { taskId: string; onClose: () => void }) => (
    <div role="dialog" aria-label={`Task ${taskId}`}>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { Card } from "@/components/ui/Card";
import { ToastProvider } from "@/components/ui/Toast";
import TasksPage from "@/app/(app)/tasks/page";
import ProjectTasksPage from "@/app/(app)/tasks/[projectId]/page";

const TASKS = [
  { id: "k1", title: "First task", status: "open", priority: "HIGH", createdAt: "2026-01-03T00:00:00Z" },
  { id: "k2", title: "Second task", status: "open", priority: "HIGH", createdAt: "2026-01-02T00:00:00Z" },
];

beforeEach(() => {
  localStorage.clear();
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url: string) =>
    url === "/api/tasks/projects"
      ? { projects: [{ id: "p1", name: "P", slug: "p", description: "" }] }
      : { tasks: TASKS },
  );
});
afterEach(cleanup);

async function cards() {
  await screen.findByText("First task");
  return screen.getAllByRole("button", { name: /^(First|Second) task/ });
}

describe.each(["list", "board"])("task cards (%s view)", (view) => {
  beforeEach(() => localStorage.setItem("project-pilot:task-view", view));

  it("Enter on a focused card opens the panel", async () => {
    const user = userEvent.setup();
    render(<ProjectTasksPage />);
    const [first] = await cards();
    first.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Task k1" })).toBeInTheDocument();
  });

  it("Space opens the panel and does not scroll the page", async () => {
    render(<ProjectTasksPage />);
    const [first] = await cards();
    first.focus();
    const notPrevented = fireEvent.keyDown(first, { key: " " });
    expect(notPrevented).toBe(false);
    expect(screen.getByRole("dialog", { name: "Task k1" })).toBeInTheDocument();
  });

  it("Tab reaches the cards in order", async () => {
    const user = userEvent.setup();
    render(<ProjectTasksPage />);
    const found = await cards();
    found[0].focus();
    await user.tab();
    expect(found[1]).toHaveFocus();
  });

  it("focus returns to the card that opened the panel", async () => {
    const user = userEvent.setup();
    render(<ProjectTasksPage />);
    const found = await cards();
    found[1].focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(found[1]).toHaveFocus();
  });

  it("a click still opens the panel", async () => {
    const user = userEvent.setup();
    render(<ProjectTasksPage />);
    const [first] = await cards();
    await user.click(first);
    expect(screen.getByRole("dialog", { name: "Task k1" })).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("without onClick stays a plain div", () => {
    render(<Card data-testid="c">x</Card>);
    const el = screen.getByTestId("c");
    expect(el.tagName).toBe("DIV");
    expect(el).not.toHaveAttribute("role");
    expect(el).not.toHaveAttribute("tabindex");
  });

  it("with onClick is a focusable button", () => {
    render(<Card data-testid="c" onClick={() => {}}>x</Card>);
    const el = screen.getByTestId("c");
    expect(el).toHaveAttribute("role", "button");
    expect(el).toHaveAttribute("tabindex", "0");
  });

  it("Enter or Space on a control nested inside the card does not activate the card", () => {
    const onCard = vi.fn();
    const onInner = vi.fn();
    render(
      <Card data-testid="c" onClick={onCard}>
        <button type="button" onKeyDown={onInner}>inner</button>
      </Card>,
    );
    const inner = screen.getByText("inner");
    fireEvent.keyDown(inner, { key: "Enter" });
    fireEvent.keyDown(inner, { key: " " });
    expect(onInner).toHaveBeenCalledTimes(2);
    expect(onCard).not.toHaveBeenCalled();
  });

  it("an onKeyDown that prevents the default suppresses activation", () => {
    const onCard = vi.fn();
    render(
      <Card data-testid="c" onClick={onCard} onKeyDown={(e) => e.preventDefault()}>
        x
      </Card>,
    );
    fireEvent.keyDown(screen.getByTestId("c"), { key: "Enter" });
    expect(onCard).not.toHaveBeenCalled();
  });
});

describe("List/Board toggle", () => {
  it("aria-pressed follows the active view", async () => {
    const user = userEvent.setup();
    render(<ProjectTasksPage />);
    await screen.findByText("First task");
    const group = screen.getByRole("group", { name: "View" });
    expect(group).toContainElement(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Board view" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Board view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Board view" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("project search", () => {
  it("has an accessible name", async () => {
    apiFetch.mockImplementation(async (url: string) =>
      url === "/api/tasks/projects"
        ? { projects: [{ id: "p1", name: "P", slug: "p", description: "" }] }
        : { teams: [] },
    );
    render(<ToastProvider><TasksPage /></ToastProvider>);
    expect(await screen.findByRole("textbox", { name: /search projects/i })).toBeInTheDocument();
  });
});
