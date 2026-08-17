// @vitest-environment jsdom
//
// Component test for InstallRelayWizard. Runs under jsdom (opted in via the
// docblock above) while the rest of frontend/tests/ stays on vitest's default
// node environment (see tests/api.test.ts) — see vitest.config.ts.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallRelayWizard } from "@/components/deploys/InstallRelayWizard";
import { apiFetch, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// Small SSE-frame helper: encodes `event: <name>\ndata: <json>\n\n` frames
// (the format InstallRelayWizard's hand-rolled parser expects) and packages
// them into a ReadableStream<Uint8Array>, matching what `res.body` is on a
// real streaming fetch Response.
const encoder = new TextEncoder();
function sseFrame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function sseStream(frames: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(frame);
      controller.close();
    },
  });
}

/**
 * A stream whose chunks are pushed by the test on its own schedule (rather
 * than all upfront), so intermediate render state (e.g. a specific progress
 * line, or "stream closed without a result") can be asserted mid-flight.
 */
function sseGatedStream() {
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    stream,
    push(frame: Uint8Array) {
      controllerRef.enqueue(frame);
    },
    close() {
      controllerRef.close();
    },
  };
}

// Mirrors the base-URL resolution in InstallRelayWizard.tsx (and src/lib/api.ts)
// so request-shape assertions compare against the same default the component uses.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const noop = () => {};

/**
 * Fill in the minimum fields required by validateForm() (name/host/password).
 * Uses fireEvent.change rather than userEvent.type: these are controlled
 * inputs and a single synchronous change event is sufficient (and avoids
 * per-keystroke timing flakiness observed with userEvent.type here).
 */
function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "vps-01" } });
  fireEvent.change(screen.getByLabelText("Host"), { target: { value: "1.2.3.4" } });
  fireEvent.change(screen.getByLabelText("SSH password"), { target: { value: "s3cr3t" } });
}

describe("InstallRelayWizard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // jsdom doesn't implement scrollIntoView (used by the wizard's
    // auto-scroll-log effect); stub it so that effect is a no-op in tests.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("secrets", () => {
    it("clears the SSH password field when the modal closes and reopens", () => {
      const { rerender } = render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fireEvent.change(screen.getByLabelText("SSH password"), { target: { value: "s3cr3t" } });
      expect(screen.getByLabelText("SSH password")).toHaveValue("s3cr3t");

      rerender(<InstallRelayWizard open={false} onClose={noop} onSuccess={noop} />);
      rerender(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);

      expect(screen.getByLabelText("SSH password")).toHaveValue("");
    });
  });

  describe("probe (apiFetch)", () => {
    it("renders the probe results after a successful probe", async () => {
      const user = userEvent.setup();
      mockedApiFetch.mockResolvedValueOnce({
        probe: {
          suggestedMode: "docker",
          port80: { kind: "free" },
          port443: { kind: "free" },
          suggestedTraefikNetwork: "traefik-public",
        },
        hostKeySha256: "SHA256:abc123",
      });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /test connection & continue/i }));

      await waitFor(() => expect(screen.getByText("Connection test passed")).toBeInTheDocument());
      expect(screen.getByText("docker")).toBeInTheDocument();
      expect(screen.getByText("traefik-public")).toBeInTheDocument();
      expect(screen.getByText("SHA256:abc123")).toBeInTheDocument();
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/api/deploy/probe-vps",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("shows an inline error and stays on the form when the probe rejects", async () => {
      const user = userEvent.setup();
      mockedApiFetch.mockRejectedValueOnce(new ApiError("SSH auth failed", 401, {}));

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /test connection & continue/i }));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("SSH auth failed"));
      // Probe failure returns to the "form" step (retry in place), not the
      // dedicated "error" step used by install-stream failures below.
      expect(screen.getByRole("button", { name: /test connection & continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    });
  });

  describe("install (SSE stream)", () => {
    it("streams progress and renders the done state on an event:done frame", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: sseStream([
          sseFrame("progress", { stream: "stdout", line: "Connecting..." }),
          sseFrame("progress", { stream: "stdout", line: "Installing packages..." }),
          sseFrame("done", {
            serverId: "srv1",
            name: "vps-01",
            host: "1.2.3.4",
            relayUrl: "https://relay.example.com/deploy",
          }),
        ]),
      });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      await waitFor(() => expect(screen.getByText("Relay installed successfully")).toBeInTheDocument());
      expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
      expect(screen.getByText("https://relay.example.com/deploy")).toBeInTheDocument();
    });

    it("assembles a done frame that is split across two stream chunks", async () => {
      const user = userEvent.setup();
      const donePayload = {
        serverId: "srv1",
        name: "vps-01",
        host: "1.2.3.4",
        relayUrl: "https://relay.example.com/deploy",
      };
      const progressFrameText = `event: progress\ndata: ${JSON.stringify({ stream: "stdout", line: "Connecting..." })}\n\n`;
      const doneFrameText = `event: done\ndata: ${JSON.stringify(donePayload)}\n\n`;
      const fullBytes = encoder.encode(progressFrameText + doneFrameText);
      // Split partway *into* the done frame itself, not merely inside the
      // progress frame before it — a split confined to the progress frame
      // would not exercise the buffer's carry-over of a partial "done"
      // frame across the chunk boundary.
      const splitOffset = encoder.encode(progressFrameText).length + 10;
      const chunk1 = fullBytes.slice(0, splitOffset);
      const chunk2 = fullBytes.slice(splitOffset);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: sseStream([chunk1, chunk2]),
      });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      await waitFor(() => expect(screen.getByText("Relay installed successfully")).toBeInTheDocument());
      expect(screen.getByText(donePayload.relayUrl)).toBeInTheDocument();
    });

    it("renders a distinctive progress line in the log pane while streaming", async () => {
      const user = userEvent.setup();
      const gated = sseGatedStream();
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: gated.stream });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      gated.push(sseFrame("progress", { stream: "stdout", line: "Installing docker packages..." }));
      await waitFor(() =>
        expect(screen.getByText("Installing docker packages...")).toBeInTheDocument()
      );

      gated.push(
        sseFrame("done", {
          serverId: "srv1",
          name: "vps-01",
          host: "1.2.3.4",
          relayUrl: "https://relay.example.com/deploy",
        })
      );
      gated.close();

      await waitFor(() => expect(screen.getByText("Relay installed successfully")).toBeInTheDocument());
    });

    it("shows the stream-ended error when the stream closes without a done or error event", async () => {
      const user = userEvent.setup();
      const gated = sseGatedStream();
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: gated.stream });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      gated.push(sseFrame("progress", { stream: "stdout", line: "Connecting..." }));
      await waitFor(() => expect(screen.getByText("Connecting...")).toBeInTheDocument());

      gated.close();

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Install stream ended without a result."
        )
      );
    });

    it("sends the install request with the exact URL, method, credentials and headers, and keeps the password out of the URL", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: sseStream([
          sseFrame("done", {
            serverId: "srv1",
            name: "vps-01",
            host: "1.2.3.4",
            relayUrl: "https://relay.example.com/deploy",
          }),
        ]),
      });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      await waitFor(() => expect(screen.getByText("Relay installed successfully")).toBeInTheDocument());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_URL}/api/deploy/install-relay`);
      expect(url).not.toContain("?");
      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
      expect(String(init.body)).toContain("s3cr3t");
      expect(url).not.toContain("s3cr3t");
    });

    it("renders the error state on an event:error frame", async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: sseStream([
          sseFrame("progress", { stream: "stdout", line: "Connecting..." }),
          sseFrame("error", {
            kind: "host_key_rejected",
            message: "Host key mismatch — aborting install.",
          }),
        ]),
      });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("Host key mismatch — aborting install.")
      );
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });
  });

  describe("unmount mid-flow", () => {
    it("aborts the in-flight install request when unmounted while installing", async () => {
      const user = userEvent.setup();
      let capturedSignal: AbortSignal | undefined;
      fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        // Never resolves: simulates an install still in flight when the
        // wizard is unmounted (e.g. the parent navigates away / modal host
        // unmounts). Only the cleanup effect's abort() call is observable.
        return new Promise<never>(() => {});
      });

      const { unmount } = render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      await waitFor(() => expect(screen.getByText(/installing relay/i)).toBeInTheDocument());
      expect(capturedSignal?.aborted).toBe(false);

      unmount();

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe("close mid-flow", () => {
    it("aborts the in-flight install request when the modal's close button is clicked while installing", async () => {
      const user = userEvent.setup();
      let capturedSignal: AbortSignal | undefined;
      fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        // Never resolves: the close button's abort() call must be the only
        // thing that flips the captured signal.
        return new Promise<never>(() => {});
      });

      render(<InstallRelayWizard open onClose={noop} onSuccess={noop} />);
      fillRequiredFields();
      await user.click(screen.getByRole("button", { name: /skip & install/i }));

      await waitFor(() => expect(screen.getByText(/installing relay/i)).toBeInTheDocument());
      expect(capturedSignal?.aborted).toBe(false);

      await user.click(screen.getByRole("button", { name: /close/i }));

      expect(capturedSignal?.aborted).toBe(true);
    });
  });
});
