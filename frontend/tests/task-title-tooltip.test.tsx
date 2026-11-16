// @vitest-environment jsdom
//
// Task rows and board cards clip the title with `truncate`; the full title
// must stay reachable through a matching `title` attribute in both views.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tasks",
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ projectId: "p1" }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/TaskDetailPanel", () => ({ TaskDetailPanel: () => null }));

import ProjectTasksPage from "@/app/(app)/tasks/[projectId]/page";

const LONG_TITLE =
  "Task with a very long title the truncate class clips: add retry to the webhook sender";
const TASKS = [
  { id: "t1", title: LONG_TITLE, status: "open", priority: "HIGH", createdAt: "2026-01-03T00:00:00Z" },
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

describe("task title tooltip", () => {
  it("list view rows carry a title attribute with the full title", async () => {
    localStorage.setItem("project-pilot:task-view", "list");
    render(<ProjectTasksPage />);
    const row = await screen.findByText(LONG_TITLE);
    expect(row.tagName).toBe("SPAN");
    expect(row).toHaveAttribute("title", LONG_TITLE);
  });

  it("board view cards carry a title attribute with the full title", async () => {
    localStorage.setItem("project-pilot:task-view", "board");
    render(<ProjectTasksPage />);
    const card = await screen.findByText(LONG_TITLE);
    expect(card.tagName).toBe("P");
    expect(card).toHaveAttribute("title", LONG_TITLE);
  });
});
