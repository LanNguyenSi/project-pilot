// @vitest-environment jsdom
//
// TaskDetailPanel loading state: skeleton (no stale task) on switch and reopen.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});
const mocked = vi.mocked(apiFetch);

function task(id: string, title: string) {
  return {
    task: {
      id, title, description: null, status: "open", priority: "medium", templateData: null,
      branchName: null, prUrl: null, prNumber: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    },
  };
}

type Resolver = (v: unknown) => void;
let pending: Record<string, Resolver>;
let fetched: string[];

beforeEach(() => {
  pending = {};
  fetched = [];
  mocked.mockImplementation((path: string) => {
    if (path.endsWith("/instructions")) return Promise.resolve({}) as never;
    const id = decodeURIComponent(path.split("/").pop() ?? "");
    fetched.push(id);
    return new Promise((resolve) => {
      pending[id] = resolve;
    }) as never;
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function settle(id: string, title: string) {
  await act(async () => {
    pending[id](task(id, title));
  });
}

describe("TaskDetailPanel", () => {
  it("shows no title while loading, then the task", async () => {
    render(<TaskDetailPanel taskId="t1" open onClose={() => {}} />);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    await settle("t1", "First");
    expect(screen.getByRole("heading", { level: 2, name: "First" })).toBeInTheDocument();
  });

  it("drops the previous task and refetches when taskId changes", async () => {
    const { rerender } = render(<TaskDetailPanel taskId="t1" open onClose={() => {}} />);
    await settle("t1", "First");
    rerender(<TaskDetailPanel taskId="t2" open onClose={() => {}} />);
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(fetched).toEqual(["t1", "t2"]);
    await settle("t2", "Second");
    expect(screen.getByRole("heading", { level: 2, name: "Second" })).toBeInTheDocument();
  });

  it("refetches and shows no stale task after close and reopen with the same id", async () => {
    const { rerender } = render(<TaskDetailPanel taskId="t1" open onClose={() => {}} />);
    await settle("t1", "First");
    rerender(<TaskDetailPanel taskId="t1" open={false} onClose={() => {}} />);
    rerender(<TaskDetailPanel taskId="t1" open onClose={() => {}} />);
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(fetched).toEqual(["t1", "t1"]);
    await settle("t1", "First again");
    expect(screen.getByRole("heading", { level: 2, name: "First again" })).toBeInTheDocument();
  });

  it("does not fetch while closed", () => {
    render(<TaskDetailPanel taskId="t1" open={false} onClose={() => {}} />);
    expect(fetched).toEqual([]);
  });

  it("does not show the previous task when the next fetch fails", async () => {
    const { rerender } = render(<TaskDetailPanel taskId="t1" open onClose={() => {}} />);
    await settle("t1", "First");
    rerender(<TaskDetailPanel taskId="t2" open onClose={() => {}} />);
    await act(async () => {
      pending["t2"](Promise.reject(new Error("nope")));
    });
    expect(await screen.findByText("nope")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });

  it("clears a previous error when switching task", async () => {
    const { rerender } = render(<TaskDetailPanel taskId="t1" open onClose={() => {}} />);
    await act(async () => {
      pending["t1"](Promise.reject(new Error("boom")));
    });
    expect(await screen.findByText("boom")).toBeInTheDocument();
    rerender(<TaskDetailPanel taskId="t2" open onClose={() => {}} />);
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    await settle("t2", "Second");
    expect(screen.getByRole("heading", { level: 2, name: "Second" })).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("shows the error and clears loading when the fetch fails", async () => {
    render(<TaskDetailPanel taskId="t1" open onClose={() => {}} />);
    mocked.mockReset();
    await act(async () => {
      pending["t1"](Promise.reject(new Error("boom")));
    });
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
