"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ConfirmModal, SkeletonBox, useToast } from "@/components/ui";
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

  const fetchData = useCallback(async () => {
    try {
      const [srvData, appData, deployData] = await Promise.all([
        apiFetch<{ servers: Server[] }>("/api/deploy/servers"),
        apiFetch<{ apps: App[] }>("/api/deploy/apps"),
        apiFetch<{ deploys: Deploy[] }>("/api/deploy/history?limit=20"),
      ]);
      setServers(srvData.servers);
      setApps(appData.apps);
      setDeploys(deployData.deploys);
    } catch (err) {
      if (err instanceof Error && err.message.includes("401")) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [router]);

  useEffect(() => {
    void fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Auto-refresh while active deploys exist
  const hasActiveDeploys = deploys.some((d) => d.status === "running" || d.status === "deploying");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (hasActiveDeploys) {
      pollRef.current = setInterval(() => void fetchData(), 5_000);
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
      const data = await apiFetch<{ deploys: Deploy[] }>("/api/deploy/history?limit=20");
      setDeploys(data.deploys);
      setTab("history");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Deploy failed", variant: "error" });
    } finally {
      setDeploying(false);
      setDeployTarget(null);
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
    { key: "history", label: "History", count: deploys.length },
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
        <div role="tabpanel" aria-label="Servers" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {servers.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm text-content-primary">{s.name}</h3>
                <Badge variant={statusBadge[s.status] || "neutral"} dot>{s.status}</Badge>
              </div>
              <p className="text-xs text-content-tertiary font-mono">{s.host}</p>
              <p className="text-xs text-content-tertiary mt-1">{s.appCount} app{s.appCount !== 1 ? "s" : ""}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Apps tab */}
      {tab === "apps" && (
        <div role="tabpanel" aria-label="Applications" className="space-y-2">
          {apps.map((a) => (
            <Card key={a.id} className="flex items-center gap-4">
              <Badge variant={statusBadge[a.status] || "neutral"} dot>{a.status}</Badge>
              <span className="flex-1 text-sm text-content-primary">{a.name}</span>
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
          ))}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (<div role="tabpanel" aria-label="History">
        {deploys.length === 0 ? (
          <p className="text-content-secondary text-sm">No deploys yet</p>
        ) : (
          <div className="space-y-0">
            {deploys.map((d) => {
              const isActive = d.status === "running" || d.status === "deploying";
              return (
                <div
                  key={d.id}
                  className={`flex items-center gap-4 py-3 border-b border-stroke-default ${
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
    </>
  );
}
