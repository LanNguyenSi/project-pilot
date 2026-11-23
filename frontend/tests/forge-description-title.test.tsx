// @vitest-environment jsdom
//
// The /forge cards clamp the description to two lines; the full text is in the
// title attribute so a truncated description can be read on hover.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  ApiError: class ApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import ForgePage from "@/app/(app)/forge/page";

const long = "A long description that goes on. ".repeat(12).trim();

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url: string) =>
    url === "/api/forge/projects"
      ? {
          projects: [
            {
              id: "p1",
              projectName: "alpha",
              description: long,
              repoUrl: "https://github.com/o/alpha",
              createdAt: "2026-01-01T00:00:00Z",
            },
          ],
        }
      : { projects: [] },
  );
});
afterEach(cleanup);

describe("Forge project card description", () => {
  it("carries the full text as title", async () => {
    render(<ForgePage />);
    const p = await screen.findByText(long);
    expect(p).toHaveClass("line-clamp-2");
    expect(p).toHaveAttribute("title", long);
  });
});
