"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ConfirmModal, Input, Modal, SkeletonBox, useToast } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

interface Server {
  id: string;
  name: string;
  host: string;
  status: string;
  appCount: number;
}

interface App {
  id: string;
  name: string;
  status: string;
  server: { id: string; name: string };
  lastDeployAt: string | null;
}

interface Deploy {
  id: string;
  server: string;
  app: string;
  status: string;
  commitAfter: string | null;
  duration: number | null;
  triggeredBy: string;
  createdAt: string;
}

type Tab = "servers" | "apps" | "history";

const statusBadge: Record<string, BadgeVariant> = {
  online: "success",
  success: "success",
  healthy: "success",
  offline: "error",
  failed: "error",
  unhealthy: "error",
  running: "warning",
  deploying: "warning",
  rolled_back: "purple",
  unknown: "neutral",
};

export default function DeploysPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [servers, setServers] = useState<Server[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("servers");
  const [deployTarget, setDeployTarget] = useState<{ server: string; app: string } | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [tasksProjects, setTasksProjects] = useState<{ id: string; name: string; slug: string; githubRepo: string | null }[]>([]);
  const [logDeploy, setLogDeploy] = useState<Deploy | null>(null);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [deployTotal, setDeployTotal] = useState(0);
  const [deployPage, setDeployPage] = useState(0);
  const deploysPerPage = 20;
  const [serverFilter, setServerFilter] = useState("");
  const [appFilter, setAppFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [addServerOpen, setAddServerOpen] = useState(false);
  const [addServerSubmitting, setAddServerSubmitting] = useState(false);
  const [addServerError, setAddServerError] = useState("");
  const [newServerName, setNewServerName] = useState("");
  const [newServerHost, setNewServerHost] = useState("");
  const [newServerSshKeyPath, setNewServerSshKeyPath] = useState("");
  const [newServerRelayUrl, setNewServerRelayUrl] = useState("");
  const [newServerRelayToken, setNewServerRelayToken] = useState("");
  const [deleteServerTarget, setDeleteServerTarget] = useState<Server | null>(null);
  const [deleteServerSubmitting, setDeleteServerSubmitting] = useState(false);

  const buildHistoryParams = useCallback((page: number, server: string, app: string, status: string) => {
    const params = new URLSearchParams();
    params.set("limit", String(deploysPerPage));
    params.set("offset", String(page * deploysPerPage));
    if (server) params.set("server_id", server);
    if (app) params.set("app_id", app);
    if (status) params.set("status", status);
    return params;
  }, []);

  const fetchHistory = useCallback(async (page: number, server: string, app: string, status: string) => {
    const params = buildHistoryParams(page, server, app, status);
    const data = await apiFetch<{ deploys: Deploy[]; total: number }>(
      `/api/deploy/history?${params}`,
    );
    setDeploys(data.deploys);
    setDeployTotal(data.total ?? data.deploys.length);
  }, [buildHistoryParams]);

  const fetchData = useCallback(async () => {
    try {
      const [srvData, appData, tasksData] = await Promise.all([
        apiFetch<{ servers: Server[] }>("/api/deploy/servers"),
        apiFetch<{ apps: App[] }>("/api/deploy/apps"),
        apiFetch<{ projects: { id: string; name: string; slug: string; githubRepo: string | null }[] }>("/api/tasks/projects").catch(() => ({ projects: [] as { id: string; name: string; slug: string; githubRepo: string | null }[] })),
      ]);
      setServers(srvData.servers);
      setApps(appData.apps);
      setTasksProjects(tasksData.projects);
    } catch (err) {
      if (err instanceof Error && err.message.includes("401")) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [router]);

  useEffect(() => {
    void Promise.all([fetchData(), fetchHistory(deployPage, serverFilter, appFilter, statusFilter)])
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) {
      void fetchHistory(deployPage, serverFilter, appFilter, statusFilter);
    }
  }, [deployPage, serverFilter, appFilter, statusFilter, fetchHistory]);

  // Auto-refresh while active deploys exist
  const hasActiveDeploys = deploys.some((d) => d.status === "running" || d.status === "deploying");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (hasActiveDeploys) {
      pollRef.current = setInterval(() => {
        void fetchData();
        void fetchHistory(deployPage, serverFilter, appFilter, statusFilter);
      }, 5_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasActiveDeploys, fetchData]);

  async function handleDeploy() {
    if (!deployTarget) return;
    setDeploying(true);
    try {
      await apiFetch("/api/deploy/trigger", {
        method: "POST",
        body: JSON.stringify({ server: deployTarget.server, app: deployTarget.app, force: true }),
      });
      toast({ title: `Deploy started for ${deployTarget.app}`, variant: "success" });
      setDeployPage(0);
      setServerFilter("");
      setAppFilter("");
      setStatusFilter("");
      await fetchHistory(0, "", "", "");
      setTab("history");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Deploy failed", variant: "error" });
    } finally {
      setDeploying(false);
      setDeployTarget(null);
    }
  }

  function resetAddServerForm() {
    setNewServerName("");
    setNewServerHost("");
    setNewServerSshKeyPath("");
    setNewServerRelayUrl("");
    setNewServerRelayToken("");
    setAddServerError("");
  }

  async function handleAddServer(e: React.FormEvent) {
    e.preventDefault();
    setAddServerError("");
    if (!newServerName.trim() || !newServerHost.trim()) {
      setAddServerError("Name and host are required");
      return;
    }
    setAddServerSubmitting(true);
    try {
      await apiFetch("/api/deploy/servers", {
        method: "POST",
        body: JSON.stringify({
          name: newServerName.trim(),
          host: newServerHost.trim(),
          sshKeyPath: newServerSshKeyPath.trim() || undefined,
          relayUrl: newServerRelayUrl.trim() || undefined,
          relayToken: newServerRelayToken.trim() || undefined,
        }),
      });
      toast({ title: `Server "${newServerName.trim()}" added`, variant: "success" });
      setAddServerOpen(false);
      resetAddServerForm();
      await fetchData();
    } catch (err) {
      setAddServerError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setAddServerSubmitting(false);
    }
  }

  async function handleDeleteServer() {
    if (!deleteServerTarget) return;
    setDeleteServerSubmitting(true);
    try {
      await apiFetch(`/api/deploy/servers/${encodeURIComponent(deleteServerTarget.id)}`, {
        method: "DELETE",
      });
      toast({ title: `Server "${deleteServerTarget.name}" deleted`, variant: "success" });
      setDeleteServerTarget(null);
      await fetchData();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to delete server", variant: "error" });
    } finally {
      setDeleteServerSubmitting(false);
    }
  }

  async function handleViewLogs(d: Deploy) {
    setLogDeploy(d);
    setLogContent(null);
    setLogLoading(true);
    try {
      const data = await apiFetch<{ deploy?: { log?: string; steps?: unknown[] } }>(`/api/deploy/status/${encodeURIComponent(d.id)}`);
      const log = data.deploy?.log;
      if (log) {
        // Try to parse as JSON steps, fall back to raw text
        try {
          const steps = JSON.parse(log) as { step: string; status: string; output?: string }[];
          setLogContent(steps.map((s) => `[${s.status}] ${s.step}${s.output ? `\n${s.output}` : ""}`).join("\n\n"));
        } catch {
          setLogContent(log);
        }
      } else {
        setLogContent("No logs available for this deploy.");
      }
    } catch (err) {
      setLogContent(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLogLoading(false);
    }
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading">
        <SkeletonBox className="h-7 w-36 mb-6" />
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Card key={i} className="flex items-center gap-4">
              <SkeletonBox className="h-4 w-16" />
              <SkeletonBox className="h-4 flex-1 max-w-xs" />
              <SkeletonBox className="h-4 w-20" />
            </Card>
          ))}
        </div>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "servers", label: "Servers", count: servers.length },
    { key: "apps", label: "Applications", count: apps.length },
    { key: "history", label: "History", count: deployTotal },
  ];

  return (
    <>

      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {/* Tab bar */}
      <div className="border-b border-stroke-default mb-6">
        <div className="flex gap-0" role="tablist" aria-label="Deployment sections">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-fast -mb-px ${
                tab === t.key
                  ? "text-content-primary border-accent-blue"
                  : "text-content-secondary border-transparent hover:text-content-primary"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-content-tertiary">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Servers tab */}
      {tab === "servers" && (
        <div role="tabpanel" aria-label="Servers">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => setAddServerOpen(true)}>+ Add Server</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {servers.map((s) => (
              <Card key={s.id}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="font-medium text-sm text-content-primary truncate" title={s.name}>{s.name}</h3>
                  <Badge variant={statusBadge[s.status] || "neutral"} dot>{s.status}</Badge>
                </div>
                <p className="text-xs text-content-tertiary font-mono truncate" title={s.host}>{s.host}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-content-tertiary">{s.appCount} app{s.appCount !== 1 ? "s" : ""}</p>
                  <button
                    onClick={() => setDeleteServerTarget(s)}
                    className="text-xs text-content-tertiary hover:text-accent-red transition-colors"
                    aria-label={`Delete ${s.name}`}
                  >
                    Delete
                  </button>
                </div>
              </Card>
            ))}
            {servers.length === 0 && (
              <p className="col-span-full text-content-secondary text-sm">
                No servers configured. Click &ldquo;Add Server&rdquo; to connect one.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Apps tab */}
      {tab === "apps" && (
        <div role="tabpanel" aria-label="Applications" className="space-y-2">
          {apps.map((a) => {
            const appLower = a.name.toLowerCase();
            const linkedProject = tasksProjects.find((tp) => tp.slug.toLowerCase() === appLower || tp.name.toLowerCase() === appLower);
            return (
            <Card key={a.id} className="flex items-center gap-4">
              <Badge variant={statusBadge[a.status] || "neutral"} dot>{a.status}</Badge>
              <span className="flex-1 text-sm text-content-primary">
                {a.name}
                {linkedProject && (
                  <Link href={`/tasks/${linkedProject.id}`} className="ml-2 text-xs text-accent-blue hover:underline" onClick={(e) => e.stopPropagation()}>
                    Tasks →
                  </Link>
                )}
              </span>
              <span className="text-xs text-content-tertiary">{a.server.name}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={deploying}
                onClick={() => setDeployTarget({ server: a.server.name, app: a.name })}
              >
                Deploy
              </Button>
            </Card>
            );
          })}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (<div role="tabpanel" aria-label="History">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <select
            value={serverFilter}
            onChange={(e) => { setServerFilter(e.target.value); setDeployPage(0); }}
            className="px-2.5 py-1.5 text-xs rounded-button border border-stroke-default bg-surface-primary text-content-primary"
          >
            <option value="">All servers</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={appFilter}
            onChange={(e) => { setAppFilter(e.target.value); setDeployPage(0); }}
            className="px-2.5 py-1.5 text-xs rounded-button border border-stroke-default bg-surface-primary text-content-primary"
          >
            <option value="">All apps</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setDeployPage(0); }}
            className="px-2.5 py-1.5 text-xs rounded-button border border-stroke-default bg-surface-primary text-content-primary"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="deploying">Deploying</option>
            <option value="rolled_back">Rolled back</option>
          </select>
          {(serverFilter || appFilter || statusFilter) && (
            <button
              onClick={() => { setServerFilter(""); setAppFilter(""); setStatusFilter(""); setDeployPage(0); }}
              className="px-2.5 py-1.5 text-xs text-content-tertiary hover:text-content-primary transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {deploys.length === 0 ? (
          <p className="text-content-secondary text-sm">
            {serverFilter || appFilter || statusFilter ? "No matching deploys" : "No deploys yet"}
          </p>
        ) : (
          <>
            <div className="space-y-0">
              {deploys.map((d) => {
                const isActive = d.status === "running" || d.status === "deploying";
                return (
                  <div
                    key={d.id}
                    onClick={() => void handleViewLogs(d)}
                    className={`flex items-center gap-4 py-3 border-b border-stroke-default cursor-pointer hover:bg-surface-tertiary/50 transition-colors ${
                      isActive ? "bg-accent-amber/5" : ""
                    }`}
                  >
                    <span className={isActive ? "animate-pulse" : ""}>
                      <Badge variant={statusBadge[d.status] || "neutral"} dot>{d.status}</Badge>
                    </span>
                    <span className="flex-1 text-sm text-content-primary">
                      {d.app} <span className="text-content-tertiary">on</span> {d.server}
                    </span>
                    <span className="text-xs text-content-tertiary font-mono">
                      {d.commitAfter?.slice(0, 7) || "—"}
                    </span>
                    <span className="text-xs text-content-tertiary">
                      {d.duration ? `${(d.duration / 1000).toFixed(1)}s` : "—"}
                    </span>
                    <span className="text-xs text-content-tertiary">
                      {new Date(d.createdAt).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
            {deployTotal > deploysPerPage && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-content-tertiary">
                  {deployPage * deploysPerPage + 1}–{Math.min((deployPage + 1) * deploysPerPage, deployTotal)} of {deployTotal}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={deployPage === 0}
                    onClick={() => setDeployPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={(deployPage + 1) * deploysPerPage >= deployTotal}
                    onClick={() => setDeployPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>)}

      <ConfirmModal
        open={!!deployTarget}
        onClose={() => setDeployTarget(null)}
        onConfirm={handleDeploy}
        title="Deploy application"
        description={deployTarget ? `Deploy ${deployTarget.app} on ${deployTarget.server}?` : ""}
        confirmLabel="Deploy"
        loading={deploying}
      />

      <ConfirmModal
        open={!!deleteServerTarget}
        onClose={() => deleteServerSubmitting ? undefined : setDeleteServerTarget(null)}
        onConfirm={handleDeleteServer}
        title="Delete server"
        description={
          deleteServerTarget
            ? `Delete "${deleteServerTarget.name}" (${deleteServerTarget.host})? This permanently removes the server${
                deleteServerTarget.appCount > 0
                  ? `, its ${deleteServerTarget.appCount} app${deleteServerTarget.appCount === 1 ? "" : "s"},`
                  : ""
              } and all deploy history for it. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        loading={deleteServerSubmitting}
      />

      <Modal
        open={addServerOpen}
        onClose={() => {
          if (addServerSubmitting) return;
          setAddServerOpen(false);
          resetAddServerForm();
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-content-primary">Add Server</h2>
          <button
            type="button"
            onClick={() => {
              if (addServerSubmitting) return;
              setAddServerOpen(false);
              resetAddServerForm();
            }}
            className="text-content-tertiary hover:text-content-primary p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleAddServer} className="space-y-3">
          <Input
            label="Name"
            required
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
            placeholder="vps-01"
            disabled={addServerSubmitting}
          />
          <Input
            label="Host"
            required
            value={newServerHost}
            onChange={(e) => setNewServerHost(e.target.value)}
            placeholder="1.2.3.4 or example.com"
            disabled={addServerSubmitting}
          />
          <Input
            label="SSH Key Path (optional)"
            value={newServerSshKeyPath}
            onChange={(e) => setNewServerSshKeyPath(e.target.value)}
            placeholder="/root/.ssh/id_ed25519"
            disabled={addServerSubmitting}
            hint="Path on the deploy-panel host, not your local machine."
          />
          <Input
            label="Relay URL (optional)"
            type="url"
            value={newServerRelayUrl}
            onChange={(e) => setNewServerRelayUrl(e.target.value)}
            placeholder="https://relay.example.com"
            disabled={addServerSubmitting}
          />
          <Input
            label="Relay Token (optional)"
            type="password"
            value={newServerRelayToken}
            onChange={(e) => setNewServerRelayToken(e.target.value)}
            placeholder="••••••••"
            disabled={addServerSubmitting}
            autoComplete="new-password"
          />
          {addServerError && (
            <p className="text-sm text-accent-red">{addServerError}</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAddServerOpen(false);
                resetAddServerForm();
              }}
              disabled={addServerSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={addServerSubmitting}>
              Add
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!logDeploy} onClose={() => setLogDeploy(null)}>
        {logDeploy && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-content-primary">
                  {logDeploy.app} <span className="text-content-tertiary font-normal">on</span> {logDeploy.server}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={statusBadge[logDeploy.status] || "neutral"} dot>{logDeploy.status}</Badge>
                  <span className="text-xs text-content-tertiary">{new Date(logDeploy.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <button onClick={() => setLogDeploy(null)} className="text-content-tertiary hover:text-content-primary p-1" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-surface-primary border border-stroke-default rounded-button p-3 max-h-80 overflow-y-auto">
              {logLoading ? (
                <div className="space-y-2">
                  <SkeletonBox className="h-3 w-full" />
                  <SkeletonBox className="h-3 w-3/4" />
                  <SkeletonBox className="h-3 w-5/6" />
                </div>
              ) : (
                <pre className="text-xs text-content-secondary font-mono whitespace-pre-wrap break-words">{logContent}</pre>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
