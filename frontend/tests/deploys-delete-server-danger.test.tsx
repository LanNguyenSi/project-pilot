// @vitest-environment jsdom
//
// The destructive "Delete server" confirm uses the danger variant, like the
// delete confirms on /forge and /settings.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/deploys/InstallRelayWizard", () => ({ InstallRelayWizard: () => null }));

import { ToastProvider } from "@/components/ui/Toast";
import DeploysPage from "@/app/(app)/deploys/page";

const server = { id: "s1", name: "vps-01", host: "10.0.0.1", appCount: 2 };

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url?: string) => {
    if (!url) return {};
    if (url.startsWith("/api/deploy/servers")) return { servers: [server] };
    if (url.startsWith("/api/deploy/apps")) return { apps: [] };
    if (url.startsWith("/api/deploy/history")) return { deploys: [], total: 0 };
    return { projects: [] };
  });
});
afterEach(cleanup);

describe("Delete server confirm", () => {
  it("styles the confirm button as danger", async () => {
    render(
      <ToastProvider>
        <DeploysPage />
      </ToastProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete vps-01" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirm).toHaveClass("bg-danger-solid");
    expect(confirm).not.toHaveClass("bg-accent-blue");
  });
});
