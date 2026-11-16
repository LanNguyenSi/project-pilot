// @vitest-environment jsdom
//
// Defence in depth for the forge wizard: a preview/publishing phase without
// preview data must render the fallback (error banner + Back to form) instead
// of an empty content area. The fixed handleGenerate never enters that state,
// so the only way to mount it is to override the phase's initial value. Next
// pages may not take props or carry extra exports, so the override happens in
// a scoped react mock: the phase state is the only useState in the rendered
// tree initialised with the string "form", and every other useState call
// falls through to the real hook.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: ((init: unknown) =>
      actual.useState(init === "form" ? "preview" : init)) as typeof actual.useState,
  };
});

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { ToastProvider } from "@/components/ui/Toast";
import CreateProjectPage from "@/app/(app)/forge/create/page";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async () => ({ enabled: false, features: {} }));
});
afterEach(cleanup);

describe("forge wizard preview fallback", () => {
  it("renders the error and a back button instead of an empty area when preview data is missing", async () => {
    render(
      <ToastProvider>
        <CreateProjectPage />
      </ToastProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no preview to show");
    fireEvent.click(screen.getByRole("button", { name: "Back to form" }));
    expect(screen.getByRole("button", { name: "Generate Preview" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
