"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

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
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

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
    setMessage("");

    try {
      await apiFetch("/api/credentials", {
        method: "PUT",
        body: JSON.stringify({ service, token }),
      });
      setTokens((prev) => ({ ...prev, [service]: "" }));
      await loadCredentials();
      setMessage(`${service} token saved`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  async function removeToken(service: string) {
    try {
      await apiFetch(`/api/credentials/${service}`, { method: "DELETE" });
      await loadCredentials();
      setMessage(`${service} token removed`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <a
            href="/dashboard"
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
          >
            Back
          </a>
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4">Service Credentials</h2>
          <p className="text-sm text-gray-400 mb-6">
            Connect your downstream services by providing their API tokens.
            Tokens are stored encrypted.
          </p>

          {message && (
            <p className="text-sm text-green-400 mb-4">{message}</p>
          )}

          <div className="space-y-4">
            {SERVICES.map(({ key, label, hint }) => {
              const existing = credentials.find((c) => c.service === key);
              return (
                <div
                  key={key}
                  className="rounded-lg bg-gray-900 border border-gray-800 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-medium">{label}</h3>
                      <p className="text-xs text-gray-500">{hint}</p>
                    </div>
                    {existing && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-green-400">Connected</span>
                        <button
                          onClick={() => removeToken(key)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder={existing ? "Replace token..." : "Paste token..."}
                      value={tokens[key] || ""}
                      onChange={(e) =>
                        setTokens((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                    />
                    <button
                      onClick={() => saveToken(key)}
                      disabled={!tokens[key] || saving === key}
                      className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                    >
                      {saving === key ? "..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
