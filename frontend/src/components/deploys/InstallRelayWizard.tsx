"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ErrorBanner, Input, Modal, Textarea } from "@/components/ui";

// Replicates the base-URL resolution from src/lib/api.ts so the streaming
// fetch uses the exact same origin without going through apiFetch (which
// always calls res.json() and cannot handle SSE).
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type AuthMethod = "password" | "privateKey";

interface FormState {
  name: string;
  host: string;
  sshUser: string;
  sshPort: string;
  authMethod: AuthMethod;
  // Sensitive fields — cleared on close / unmount
  sshPassword: string;
  sshPrivateKey: string;
  sshPassphrase: string;
}

type WizardStep = "form" | "installing" | "error" | "done";

interface DonePayload {
  serverId: string;
  name: string;
  host: string;
  relayUrl: string;
  relayMode?: string;
}

export interface InstallRelayWizardProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful install so the parent can refresh its data. */
  onSuccess: () => void;
}

export function InstallRelayWizard({ open, onClose, onSuccess }: InstallRelayWizardProps) {
  const [step, setStep] = useState<WizardStep>("form");
  const [form, setForm] = useState<FormState>({
    name: "",
    host: "",
    sshUser: "root",
    sshPort: "22",
    authMethod: "password",
    sshPassword: "",
    sshPrivateKey: "",
    sshPassphrase: "",
  });
  const [formError, setFormError] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [donePayload, setDonePayload] = useState<DonePayload | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset all state (including sensitive fields) whenever the modal closes.
  useEffect(() => {
    if (!open) {
      setForm((f) => ({ ...f, sshPassword: "", sshPrivateKey: "", sshPassphrase: "" }));
      setStep("form");
      setLogs([]);
      setErrorMessage("");
      setDonePayload(null);
      setFormError("");
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    }
  }, [open]);

  // Safety-net: clear sensitive state and abort on unmount.
  useEffect(() => {
    return () => {
      setForm((f) => ({ ...f, sshPassword: "", sshPrivateKey: "", sshPassphrase: "" }));
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  // Auto-scroll the log pane to the newest line.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!form.name.trim() || !form.host.trim()) {
      setFormError("Server name and host are required.");
      return;
    }
    if (form.authMethod === "password" && !form.sshPassword) {
      setFormError("SSH password is required.");
      return;
    }
    if (form.authMethod === "privateKey" && !form.sshPrivateKey.trim()) {
      setFormError("Private key (PEM content) is required.");
      return;
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      host: form.host.trim(),
      sshUser: form.sshUser.trim() || "root",
      sshPort: parseInt(form.sshPort, 10) || 22,
    };
    if (form.authMethod === "password") {
      body.sshPassword = form.sshPassword;
    } else {
      body.sshPrivateKey = form.sshPrivateKey.trim();
      if (form.sshPassphrase) body.sshPassphrase = form.sshPassphrase;
    }

    setStep("installing");
    setLogs([]);

    const controller = new AbortController();
    abortRef.current = controller;

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/deploy/install-relay`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setErrorMessage("Network error: could not reach the server.");
      setStep("error");
      return;
    }

    // Non-2xx: parse JSON error body (as the backend contract specifies).
    if (!res.ok) {
      let message = `Error ${res.status}`;
      try {
        const errBody = (await res.json()) as { message?: string; error?: string };
        message = errBody.message || errBody.error || message;
      } catch {
        // ignore JSON parse failures — keep the status-code message
      }
      setErrorMessage(message);
      setStep("error");
      return;
    }

    // 2xx with SSE body — stream progress events.
    const reader = res.body?.getReader();
    if (!reader) {
      setErrorMessage("No response body from server.");
      setStep("error");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let streamDone = false;

    try {
      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by double newlines.
        const frames = buffer.split("\n\n");
        // Last element is an incomplete frame — keep it in the buffer.
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          if (!frame.trim()) continue;

          let event = "";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) {
              event = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              // SSE spec: strip one leading space; multiple data: lines in a
              // single frame are concatenated with newlines.
              dataLines.push(line.slice(5).replace(/^ /, ""));
            }
          }
          const data = dataLines.join("\n").trim();

          if (!event) continue;

          if (event === "progress") {
            // deploy-panel emits: { stream: "stdout"|"stderr", line: string }
            try {
              const payload = JSON.parse(data) as { stream: string; line: string };
              setLogs((prev) => [...prev, payload.line]);
            } catch {
              // Fallback: append raw data as-is.
              setLogs((prev) => [...prev, data]);
            }
          } else if (event === "error") {
            // deploy-panel emits: { kind: string, message: string }
            let message = data;
            try {
              const payload = JSON.parse(data) as { message?: string; kind?: string };
              message = payload.message || payload.kind || data;
            } catch {
              // use raw data string
            }
            setErrorMessage(message);
            setStep("error");
            streamDone = true;
            break;
          } else if (event === "done") {
            // deploy-panel emits: { serverId, name, host, relayUrl, relayMode? }
            try {
              const payload = JSON.parse(data) as DonePayload;
              setDonePayload(payload);
              setStep("done");
            } catch {
              setErrorMessage("Install completed but the success response could not be parsed.");
              setStep("error");
            }
            streamDone = true;
            break;
          }
        }

        if (streamDone) break;
      }

      // Stream ended without a done or error event — treat as incomplete.
      if (!streamDone) {
        setErrorMessage("Install stream ended without a result. Check the server and try again.");
        setStep("error");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setErrorMessage((err as Error).message || "Stream error");
      setStep("error");
    } finally {
      reader.releaseLock();
    }
  }

  function handleRetry() {
    // Keep non-sensitive fields so the user doesn't have to re-type them;
    // clear credentials so they must be re-entered intentionally.
    setForm((f) => ({ ...f, sshPassword: "", sshPrivateKey: "", sshPassphrase: "" }));
    setLogs([]);
    setErrorMessage("");
    setStep("form");
  }

  function handleDone() {
    onSuccess();
    onClose();
  }

  function handleClose() {
    // Abort an in-progress streaming install when the user closes the modal.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Install relay on new server" size="lg">
      {/* ── Step 1: Form ─────────────────────────────────────────────── */}
      {step === "form" && (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <Input
            label="Server name"
            required
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="vps-01"
          />
          <Input
            label="Host"
            required
            value={form.host}
            onChange={(e) => setField("host", e.target.value)}
            placeholder="1.2.3.4 or example.com"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="SSH user"
              value={form.sshUser}
              onChange={(e) => setField("sshUser", e.target.value)}
              placeholder="root"
            />
            <Input
              label="SSH port"
              type="number"
              min={1}
              max={65535}
              value={form.sshPort}
              onChange={(e) => setField("sshPort", e.target.value)}
              placeholder="22"
            />
          </div>

          {/* Auth method pill-toggle */}
          <div>
            <span className="block text-label text-content-secondary mb-1">Authentication</span>
            <div className="flex gap-1 p-1 bg-surface-primary border border-stroke-default rounded-button">
              <button
                type="button"
                className={`flex-1 text-xs font-medium py-1 rounded transition-colors duration-fast ${
                  form.authMethod === "password"
                    ? "bg-surface-elevated text-content-primary shadow-sm"
                    : "text-content-tertiary hover:text-content-secondary"
                }`}
                onClick={() => setField("authMethod", "password")}
              >
                Password
              </button>
              <button
                type="button"
                className={`flex-1 text-xs font-medium py-1 rounded transition-colors duration-fast ${
                  form.authMethod === "privateKey"
                    ? "bg-surface-elevated text-content-primary shadow-sm"
                    : "text-content-tertiary hover:text-content-secondary"
                }`}
                onClick={() => setField("authMethod", "privateKey")}
              >
                Private key
              </button>
            </div>
          </div>

          {form.authMethod === "password" ? (
            <Input
              label="SSH password"
              type="password"
              required
              value={form.sshPassword}
              onChange={(e) => setField("sshPassword", e.target.value)}
              placeholder="..."
              autoComplete="new-password"
            />
          ) : (
            <>
              <Textarea
                label="Private key (PEM)"
                required
                value={form.sshPrivateKey}
                onChange={(e) => setField("sshPrivateKey", e.target.value)}
                placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                rows={5}
                autoComplete="off"
                className="font-mono text-xs"
              />
              <Input
                label="Passphrase (optional)"
                type="password"
                value={form.sshPassphrase}
                onChange={(e) => setField("sshPassphrase", e.target.value)}
                placeholder="leave blank if none"
                autoComplete="new-password"
              />
            </>
          )}

          {formError && <ErrorBanner message={formError} />}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit">Install</Button>
          </div>
        </form>
      )}

      {/* ── Step 2: Installing (streaming log) ───────────────────────── */}
      {step === "installing" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <span>Installing relay — this may take a few minutes...</span>
          </div>
          <div className="bg-surface-primary border border-stroke-default rounded-button p-3 h-64 overflow-y-auto">
            <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap break-words">
              {logs.length === 0 ? (
                <span className="text-content-tertiary">Connecting...</span>
              ) : (
                logs.join("\n")
              )}
            </pre>
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── Step 3a: Error ────────────────────────────────────────────── */}
      {step === "error" && (
        <div className="space-y-4">
          <ErrorBanner message={errorMessage || "Install failed."} />
          {logs.length > 0 && (
            <div className="bg-surface-primary border border-stroke-default rounded-button p-3 max-h-48 overflow-y-auto">
              <p className="text-xs text-content-tertiary font-medium uppercase tracking-wider mb-2">
                Install output
              </p>
              <pre className="font-mono text-xs text-content-secondary whitespace-pre-wrap break-words">
                {logs.join("\n")}
              </pre>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={handleClose}>
              Close
            </Button>
            <Button onClick={handleRetry}>Try again</Button>
          </div>
        </div>
      )}

      {/* ── Step 3b: Done ─────────────────────────────────────────────── */}
      {step === "done" && donePayload && (
        <div className="space-y-4">
          <div className="bg-surface-primary border border-stroke-default rounded-button p-4 space-y-2">
            <p className="text-sm text-content-primary font-medium">Relay installed successfully</p>
            <div className="space-y-1 pt-1">
              <div className="flex gap-2 text-xs">
                <span className="text-content-tertiary w-20 shrink-0">Host</span>
                <span className="font-mono text-content-primary">{donePayload.host}</span>
              </div>
              {donePayload.relayUrl && (
                <div className="flex gap-2 text-xs">
                  <span className="text-content-tertiary w-20 shrink-0">Relay URL</span>
                  <span className="font-mono text-content-primary break-all">{donePayload.relayUrl}</span>
                </div>
              )}
              {donePayload.relayMode && (
                <div className="flex gap-2 text-xs">
                  <span className="text-content-tertiary w-20 shrink-0">Mode</span>
                  <span className="font-mono text-content-primary">{donePayload.relayMode}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleDone}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
