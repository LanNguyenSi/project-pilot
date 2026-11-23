// @vitest-environment jsdom
//
// Settings card header at 390 px: the title block and the action group wrap onto
// two rows instead of crowding, and a long test-result error can wrap inside its
// badge. jsdom has no layout, so the Tailwind classes are pinned.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import SettingsPage from "@/app/(app)/settings/page";

const longError = "Upstream refused the token because it was revoked by the owner of the account";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/credentials") {
      return { credentials: [{ service: "project-forge", createdAt: "2026-01-01T00:00:00Z" }] };
    }
    if (url === "/api/credentials/validate") return { valid: false, error: longError };
    return {};
  });
});
afterEach(cleanup);

describe("Settings service card", () => {
  it("wraps the header row and lets the action group shrink", async () => {
    render(<SettingsPage />);
    const badge = await screen.findByText("Connected");
    const actions = badge.parentElement as HTMLElement;
    const header = actions.parentElement as HTMLElement;
    expect(header).toHaveClass("flex-wrap", "gap-2");
    expect(actions).not.toHaveClass("shrink-0");
    expect(actions).not.toHaveClass("flex-none");
  });

  it("lets a long test-result error wrap inside its badge", async () => {
    render(<SettingsPage />);
    const test = await screen.findByRole("button", { name: "Test" });
    fireEvent.click(test);
    const badge = await waitFor(() => screen.getByText(longError));
    expect(badge).not.toHaveClass("whitespace-nowrap");
  });

  it("keeps the Connected badge on one line", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("Connected")).toHaveClass("whitespace-nowrap");
  });
});
