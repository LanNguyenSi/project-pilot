"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge, Card, Icon, SkeletonBox } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";

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
    let cancelled = false;

    async function fetchDashboard() {
      try {
        const [userData, dashData] = await Promise.all([
          apiFetch<{ user: User }>("/api/auth/me"),
          apiFetch<DashboardData>("/api/dashboard/summary"),
        ]);
        if (!cancelled) {
          setUser(userData.user);
          setData(dashData);
        }
      } catch (err) {
        if (err instanceof Error && (err.message.includes("401") || err.message.includes("Not authenticated"))) {
          router.push("/login");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchDashboard();
    const interval = setInterval(() => void fetchDashboard(), 30_000);
    return () => { cancelled = true; clearInterval(interval); };
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
    { label: "Create Project", href: "/forge/create", icon: <Icon name="plus" size={20} /> },
    { label: "View Tasks",     href: "/tasks",        icon: <Icon name="tasks" size={20} /> },
    { label: "Deployments",    href: "/deploys",      icon: <Icon name="rocket" size={20} /> },
  ];

  return (
    <>
      {/* PageHeader replaces the ad-hoc welcome <p>. */}
      <PageHeader
        title="Dashboard"
        description={user ? `Welcome, ${user.name || user.email}` : "Welcome"}
      />

      {/* Stat cards with card-stagger entrance.
          Card stagger pattern: each wrapper div carries --delay via inline style;
          animate-fade-in reads animation-delay: var(--delay, 0ms). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s, i) => (
          <StatCard
            key={s.label}
            stat={s}
            index={i}
          />
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
            <p className="text-xs text-content-tertiary mt-2">Scaffolding service - no live health check</p>
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
  blue:   { bg: "bg-accent-blue/5",   dot: "text-accent-blue" },
  amber:  { bg: "bg-accent-amber/5",  dot: "text-accent-amber" },
  green:  { bg: "bg-accent-green/5",  dot: "text-accent-green" },
  purple: { bg: "bg-accent-purple/5", dot: "text-accent-purple" },
};

function StatCard({ stat: s, index }: { stat: StatItem; index: number }) {
  const tint = accentTint[s.accent];
  return (
    // animate-fade-in reads --delay via animation-delay: var(--delay, 0ms).
    <div
      className="animate-fade-in"
      style={{ "--delay": `${index * 40}ms` } as React.CSSProperties}
    >
      <Card noPadding variant="elevated" className={`p-5 h-full ${tint.bg}`}>
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
          {!s.configured ? "-" : s.value ?? "-"}
        </p>
        <p className="text-xs text-content-tertiary mt-1">{s.subtitle}</p>
      </Card>
    </div>
  );
}
