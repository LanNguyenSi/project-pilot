// @vitest-environment jsdom
//
// The forge wizard's Generate step must never dead-end on a 200 response
// without usable preview data (a bare {"ok":true} was seen in production).
// Such a response returns the wizard to the form behind the error banner
// with every entered value kept, so Generate can be clicked again; a
// preview/publishing phase without preview data renders a fallback with a
// way back instead of an empty content area.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { ToastProvider } from "@/components/ui/Toast";
import CreateProjectPage from "@/app/(app)/forge/create/page";

const preview = {
  projectName: "my-project",
  tasks: [{ id: "t1", title: "Set up CI", wave: "wave-1", priority: "HIGH" }],
  architectureOverview: "React frontend, Fastify backend.",
  fileTree: [{ name: "src", path: "src", type: "directory" as const, children: [] }],
  taskCount: 1,
  waveCount: 1,
};

function mockGenerate(response: unknown) {
  apiFetch.mockImplementation(async (url?: string) => {
    if (url?.includes("capabilities")) return { enabled: false, features: {} };
    if (url?.includes("/api/forge/generate")) return response;
    return {};
  });
}

function renderWizard() {
  render(
    <ToastProvider>
      <CreateProjectPage />
    </ToastProvider>,
  );
}

async function fillAndGenerate() {
  await screen.findByRole("list", { name: "Progress" });
  fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "my-project" } });
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "does a thing" } });
  fireEvent.click(screen.getByRole("button", { name: "Generate Preview" }));
}

beforeEach(() => {
  apiFetch.mockReset();
  mockGenerate({ sessionId: "s1", preview });
});
afterEach(cleanup);

describe("forge wizard empty generate response", () => {
  it("a 200 without a preview field shows the error, keeps the form values, and keeps Generate available", async () => {
    mockGenerate({ ok: true });
    renderWizard();
    await fillAndGenerate();
    expect(await screen.findByRole("alert")).toHaveTextContent("no preview");
    expect(screen.getByLabelText("Project Name")).toHaveValue("my-project");
    expect(screen.getByLabelText("Summary")).toHaveValue("does a thing");
    expect(screen.getByRole("button", { name: "Generate Preview" })).toBeInTheDocument();
  });

  it("a 200 whose preview has no tasks array is treated the same way", async () => {
    mockGenerate({ sessionId: "s1", preview: { ...preview, tasks: "wave-1: Set up CI" } });
    renderWizard();
    await fillAndGenerate();
    expect(await screen.findByRole("alert")).toHaveTextContent("no preview");
    expect(screen.getByLabelText("Project Name")).toHaveValue("my-project");
    expect(screen.getByRole("button", { name: "Generate Preview" })).toBeInTheDocument();
  });

  it("a normal response renders the preview step", async () => {
    renderWizard();
    await fillAndGenerate();
    expect(await screen.findByRole("heading", { name: "Tasks (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to form" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
