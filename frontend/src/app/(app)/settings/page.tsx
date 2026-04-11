"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ConfirmModal, Input, useToast } from "@/components/ui";

interface Credential {
  id: string;
  service: string;
  label: string | null;
  updatedAt: string;
}

const SERVICES = [
  { key: "project-forge", label: "Project Forge", hint: "API Key from project-forge settings" },
  { key: "agent-tasks", label: "Agent Tasks", hint: "Bearer token from agent-tasks team settings" },
  { key: "deploy-panel", label: "Deploy Panel", hint: "API Key (dp_...) or Panel Token" },
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<{ key: string; label: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; error?: string }>>({});

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    try {
      const data = await apiFetch<{ credentials: Credential[] }>("/api/credentials");
      setCredentials(data.credentials);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function saveToken(service: string) {
    const token = tokens[service];
    if (!token) return;

    setSaving(service);
    try {
      await apiFetch("/api/credentials", {
        method: "PUT",
        body: JSON.stringify({ service, token }),
      });
      setTokens((prev) => ({ ...prev, [service]: "" }));
      await loadCredentials();
      toast({ title: `${service} token saved`, variant: "success" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to save", variant: "error" });
    } finally {
      setSaving(null);
    }
  }

  async function testConnection(service: string) {
    setTesting(service);
    setTestResults((prev) => { const next = { ...prev }; delete next[service]; return next; });
    try {
      const data = await apiFetch<{ valid: boolean; error?: string }>("/api/credentials/validate", {
        method: "POST",
        body: JSON.stringify({ service }),
      });
      setTestResults((prev) => ({ ...prev, [service]: data }));
    } catch {
      setTestResults((prev) => ({ ...prev, [service]: { valid: false, error: "Test failed" } }));
    } finally {
      setTesting(null);
    }
  }

  async function removeToken() {
    if (!removeTarget) return;
    try {
      await apiFetch(`/api/credentials/${removeTarget.key}`, { method: "DELETE" });
      await loadCredentials();
      toast({ title: `${removeTarget.label} token removed`, variant: "success" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to remove", variant: "error" });
    } finally {
      setRemoveTarget(null);
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading">
        <div className="bg-surface-tertiary rounded-md animate-pulse h-7 w-32 mb-8" />
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="space-y-3">
              <div className="bg-surface-tertiary rounded-md animate-pulse h-4 w-28" />
              <div className="bg-surface-tertiary rounded-md animate-pulse h-9 w-full" />
            </Card>
          ))}
        </div>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-content-secondary mb-8">
        Connect your downstream services by providing their API tokens. Tokens are stored encrypted.
      </p>

      <div className="space-y-4 max-w-2xl">
        {SERVICES.map(({ key, label, hint }) => {
          const existing = credentials.find((c) => c.service === key);
          return (
            <Card key={key}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-sm text-content-primary">{label}</h3>
                  <p className="text-xs text-content-tertiary">{hint}</p>
                </div>
                {existing && (
                  <div className="flex items-center gap-3">
                    {testResults[key] ? (
                      <Badge variant={testResults[key].valid ? "success" : "error"} dot>
                        {testResults[key].valid ? "Valid" : testResults[key].error || "Invalid"}
                      </Badge>
                    ) : (
                      <Badge variant="success" dot>Connected</Badge>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={testing === key}
                      loading={testing === key}
                      onClick={() => testConnection(key)}
                    >
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-accent-red hover:text-accent-red/80"
                      onClick={() => setRemoveTarget({ key, label })}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={existing ? "Replace token..." : "Paste token..."}
                  value={tokens[key] || ""}
                  onChange={(e) => setTokens((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  size="md"
                  disabled={!tokens[key] || saving === key}
                  loading={saving === key}
                  onClick={() => saveToken(key)}
                >
                  Save
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={removeToken}
        title="Remove token"
        description={removeTarget ? `Remove the ${removeTarget.label} token? You will need to re-enter it to reconnect.` : ""}
        confirmLabel="Remove"
        variant="danger"
      />
    </>
  );
}
