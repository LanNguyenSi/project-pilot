"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

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

export default function DeploysPage() {
  const router = useRouter();
  const [servers, setServers] = useState<Server[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deploying, setDeploying] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ servers: Server[] }>("/api/deploy/servers"),
      apiFetch<{ apps: App[] }>("/api/deploy/apps"),
      apiFetch<{ deploys: Deploy[] }>("/api/deploy/history?limit=20"),
    ])
      .then(([srvData, appData, deployData]) => {
        setServers(srvData.servers);
        setApps(appData.apps);
        setDeploys(deployData.deploys);
      })
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleDeploy(serverName: string, appName: string) {
    if (!confirm(`Deploy ${appName} on ${serverName}?`)) return;
    setDeploying(`${serverName}/${appName}`);
    setError("");
    try {
      await apiFetch("/api/deploy/trigger", {
        method: "POST",
        body: JSON.stringify({ server: serverName, app: appName }),
      });
      // Refresh deploys
      const data = await apiFetch<{ deploys: Deploy[] }>("/api/deploy/history?limit=20");
      setDeploys(data.deploys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(null);
    }
  }

  const statusColor: Record<string, string> = {
    online: "text-green-400",
    offline: "text-red-400",
    unknown: "text-gray-400",
    success: "text-green-400",
    failed: "text-red-400",
    running: "text-yellow-400",
    rolled_back: "text-purple-400",
    healthy: "text-green-400",
    unhealthy: "text-red-400",
    deploying: "text-yellow-400",
  };

  if (loading) {
    return <p className="text-content-secondary">Loading...</p>;
  }

  return (
    <>
      <h1 className="text-page-title text-content-primary mb-6">Deployments</h1>

        {error && (
          <div className="rounded-lg bg-gray-900 border border-red-800/50 p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Servers */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Servers ({servers.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {servers.map((s) => (
              <div key={s.id} className="rounded-lg bg-gray-900 border border-gray-800 p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-sm">{s.name}</h3>
                  <span className={`text-xs ${statusColor[s.status] || "text-gray-400"}`}>{s.status}</span>
                </div>
                <p className="text-xs text-gray-500">{s.host} — {s.appCount} apps</p>
              </div>
            ))}
          </div>
        </section>

        {/* Apps */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Apps ({apps.length})</h2>
          <div className="space-y-2">
            {apps.map((a) => (
              <div key={a.id} className="rounded-lg bg-gray-900 border border-gray-800 p-4 flex items-center gap-4">
                <span className={`text-xs font-medium w-16 ${statusColor[a.status] || "text-gray-400"}`}>
                  {a.status}
                </span>
                <span className="flex-1 text-sm">{a.name}</span>
                <span className="text-xs text-gray-500">{a.server.name}</span>
                <button
                  onClick={() => handleDeploy(a.server.name, a.name)}
                  disabled={deploying !== null}
                  className="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700 disabled:opacity-50"
                >
                  {deploying === `${a.server.name}/${a.name}` ? "..." : "Deploy"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Deploys */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent Deploys</h2>
          {deploys.length === 0 ? (
            <p className="text-gray-400 text-sm">No deploys yet</p>
          ) : (
            <div className="space-y-2">
              {deploys.map((d) => (
                <div key={d.id} className="rounded-lg bg-gray-900 border border-gray-800 p-3 flex items-center gap-4 text-sm">
                  <span className={`text-xs font-medium w-20 ${statusColor[d.status] || "text-gray-400"}`}>
                    {d.status}
                  </span>
                  <span className="flex-1">{d.app} on {d.server}</span>
                  <span className="text-xs text-gray-500 font-mono">
                    {d.commitAfter?.slice(0, 7) || "—"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {d.duration ? `${(d.duration / 1000).toFixed(1)}s` : "—"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
    </>
  );
}
