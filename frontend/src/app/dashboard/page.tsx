"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface ServiceStatus {
  configured: boolean;
  projectCount?: number | null;
  claimableCount?: number | null;
  serverCount?: number | null;
  onlineCount?: number | null;
  appCount?: number | null;
  error?: string | null;
}

interface DashboardData {
  services: {
    "project-forge": ServiceStatus;
    "agent-tasks": ServiceStatus;
    "deploy-panel": ServiceStatus;
  };
}

function StatusBadge({ configured, error }: { configured: boolean; error?: string | null }) {
  if (!configured) return <span className="text-xs text-gray-500">Not configured</span>;
  if (error) return <span className="text-xs text-red-400">Error</span>;
  return <span className="text-xs text-green-400">Connected</span>;
}

function StatCard({
  title,
  value,
  subtitle,
  configured,
  error,
}: {
  title: string;
  value: string | number | null | undefined;
  subtitle: string;
  configured: boolean;
  error?: string | null;
}) {
  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-gray-400">{title}</h2>
        <StatusBadge configured={configured} error={error} />
      </div>
      <p className="text-3xl font-bold mt-2">
        {!configured ? "—" : value ?? "—"}
      </p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ user: User }>("/api/auth/me"),
      apiFetch<DashboardData>("/api/dashboard/summary"),
    ])
      .then(([userData, dashData]) => {
        setUser(userData.user);
        setData(dashData);
      })
      .catch((err: Error) => {
        if (err.message.includes("401") || err.message.includes("Not authenticated")) {
          router.push("/login");
        }
        // Non-auth errors: stay on page with partial data
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  const forge = data?.services["project-forge"];
  const tasks = data?.services["agent-tasks"];
  const deploy = data?.services["deploy-panel"];

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              Welcome, {user?.name || user?.email}
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href="/settings"
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
            >
              Settings
            </a>
            <button
              onClick={async () => {
                await apiFetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
              }}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard
            title="Projects"
            value={tasks?.projectCount}
            subtitle="via agent-tasks"
            configured={tasks?.configured ?? false}
            error={tasks?.error}
          />
          <StatCard
            title="Claimable Tasks"
            value={tasks?.claimableCount}
            subtitle="open & unassigned"
            configured={tasks?.configured ?? false}
            error={tasks?.error}
          />
          <StatCard
            title="Servers"
            value={
              deploy?.configured && deploy?.serverCount != null
                ? `${deploy.onlineCount ?? 0}/${deploy.serverCount}`
                : null
            }
            subtitle="online / total"
            configured={deploy?.configured ?? false}
            error={deploy?.error}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <StatCard
            title="Deployed Apps"
            value={deploy?.appCount}
            subtitle="via deploy-panel"
            configured={deploy?.configured ?? false}
            error={deploy?.error}
          />
          <StatCard
            title="Project Forge"
            value={forge?.configured ? "Token saved" : null}
            subtitle="project scaffolding — no live check"
            configured={forge?.configured ?? false}
          />
        </div>

        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="/forge/create"
              className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm hover:bg-gray-700"
            >
              New Project
            </a>
            <a
              href="/forge"
              className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm hover:bg-gray-700"
            >
              All Projects
            </a>
            <a
              href="/tasks"
              className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm hover:bg-gray-700"
            >
              Tasks
            </a>
            <a
              href="/deploys"
              className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm hover:bg-gray-700"
            >
              Deployments
            </a>
            <a
              href="/settings"
              className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm hover:bg-gray-700"
            >
              Configure Services
            </a>
          </div>
        </section>

        {/* Not configured hint */}
        {(!forge?.configured || !tasks?.configured || !deploy?.configured) && (
          <div className="mt-8 rounded-lg bg-gray-900 border border-yellow-800/50 p-4">
            <p className="text-sm text-yellow-400">
              Some services are not configured.{" "}
              <a href="/settings" className="underline">
                Add your API tokens in Settings
              </a>{" "}
              to see live data.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
