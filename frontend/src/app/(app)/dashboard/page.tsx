"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge, Card, SkeletonBox } from "@/components/ui";

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
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div role="status" aria-label="Loading">
        <SkeletonBox className="h-7 w-40 mb-2" />
        <SkeletonBox className="h-4 w-48 mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="p-5 space-y-3">
              <SkeletonBox className="h-3 w-20" />
              <SkeletonBox className="h-8 w-14" />
              <SkeletonBox className="h-3 w-28" />
            </Card>
          ))}
        </div>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  const forge = data?.services["project-forge"];
  const tasks = data?.services["agent-tasks"];
  const deploy = data?.services["deploy-panel"];

  const stats: StatItem[] = [
    {
      label: "Projects",
      value: tasks?.projectCount,
      subtitle: "via agent-tasks",
      configured: tasks?.configured ?? false,
      error: tasks?.error,
      accent: "blue",
    },
    {
      label: "Open Tasks",
      value: tasks?.claimableCount,
      subtitle: "claimable",
      configured: tasks?.configured ?? false,
      error: tasks?.error,
      accent: "amber",
    },
    {
      label: "Servers",
      value: deploy?.configured && deploy?.serverCount != null
        ? `${deploy.onlineCount ?? 0}/${deploy.serverCount}`
        : null,
      subtitle: "online / total",
      configured: deploy?.configured ?? false,
      error: deploy?.error,
      accent: "green",
    },
    {
      label: "Apps",
      value: deploy?.appCount,
      subtitle: "deployed",
      configured: deploy?.configured ?? false,
      error: deploy?.error,
      accent: "purple",
    },
  ];

  const quickActions = [
    { label: "Create Project", href: "/forge/create", icon: <PlusIcon /> },
    { label: "View Tasks", href: "/tasks", icon: <TaskIcon /> },
    { label: "Deployments", href: "/deploys", icon: <RocketIcon /> },
  ];

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-page-title text-content-primary">Dashboard</h1>
        <p className="text-content-secondary text-sm mt-1">
          {user ? `Welcome, ${user.name || user.email}` : "Welcome"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </div>

      {/* Two-column: Quick Actions + Forge Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Quick actions */}
        <div className="lg:col-span-2">
          <h2 className="text-section-title text-content-primary mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickActions.map((a) => (
              <Link key={a.href} href={a.href}>
                <Card variant="interactive" className="flex items-center gap-3 p-4">
                  <span className="text-content-tertiary">{a.icon}</span>
                  <span className="text-sm font-medium text-content-primary">{a.label}</span>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Forge status */}
        <div>
          <h2 className="text-section-title text-content-primary mb-4">Forge</h2>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-secondary">Project Forge</span>
              {forge?.configured ? (
                <Badge variant="success">Token saved</Badge>
              ) : (
                <Badge variant="neutral">Not configured</Badge>
              )}
            </div>
            <p className="text-xs text-content-tertiary mt-2">Scaffolding service — no live health check</p>
          </Card>
        </div>
      </div>

      {/* Not configured hint */}
      {(!forge?.configured || !tasks?.configured || !deploy?.configured) && (
        <Card className="border-accent-amber/50 p-4">
          <p className="text-sm text-accent-amber">
            Some services are not configured.{" "}
            <Link href="/settings" className="underline hover:text-accent-amber/80 transition-colors">
              Add your API tokens in Settings
            </Link>
          </p>
        </Card>
      )}
    </>
  );
}

// ── Types & Components ──────────────────────────────────────────────────────

interface StatItem {
  label: string;
  value: string | number | null | undefined;
  subtitle: string;
  configured: boolean;
  error?: string | null;
  accent: "blue" | "amber" | "green" | "purple";
}

// Full literal strings so Tailwind JIT can scan them:
// bg-accent-blue/5 bg-accent-amber/5 bg-accent-green/5 bg-accent-purple/5
// text-accent-blue text-accent-amber text-accent-green text-accent-purple
const accentTint: Record<StatItem["accent"], { bg: string; dot: string }> = {
  blue: { bg: "bg-accent-blue/5", dot: "text-accent-blue" },
  amber: { bg: "bg-accent-amber/5", dot: "text-accent-amber" },
  green: { bg: "bg-accent-green/5", dot: "text-accent-green" },
  purple: { bg: "bg-accent-purple/5", dot: "text-accent-purple" },
};

function StatCard({ stat: s }: { stat: StatItem }) {
  const tint = accentTint[s.accent];
  return (
    <Card noPadding className={`p-5 ${tint.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-label text-content-tertiary flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${tint.dot} bg-current`} />
          {s.label}
        </span>
        {!s.configured ? (
          <Badge variant="neutral">Not configured</Badge>
        ) : s.error ? (
          <Badge variant="error">Error</Badge>
        ) : (
          <Badge variant="success">Connected</Badge>
        )}
      </div>
      <p className="text-2xl font-semibold text-content-primary mt-1">
        {!s.configured ? "—" : s.value ?? "—"}
      </p>
      <p className="text-xs text-content-tertiary mt-1">{s.subtitle}</p>
    </Card>
  );
}

function PlusIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}
