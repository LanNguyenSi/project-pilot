"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Icon, SkeletonBox } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { serviceState, type ServiceState } from "@/lib/service-state";
import { serviceHintLists } from "@/lib/service-hints";

interface ServiceStatus {
  configured: boolean;
  /** Credential stored but not decryptable (e.g. after SESSION_SECRET changed). */
  unreadable?: boolean;
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
  // Shared with the rest of the (app) shell via AuthContext (see AppShell),
  // instead of fetching /api/auth/me here independently on every mount and
  // again on every 30s refresh below.
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  // True while the latest summary load failed (non-401). Cleared by the next success.
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by the retry button to restart the load and the 30 s poll.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        const dashData = await apiFetch<DashboardData>("/api/dashboard/summary");
        if (!cancelled) {
          setData(dashData);
          setLoadFailed(false);
        }
      } catch (err) {
        if (err instanceof Error && (err.message.includes("401") || err.message.includes("Not authenticated"))) {
          router.push("/login");
        } else if (!cancelled) {
          // Keep any earlier data; the render below decides what to show.
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchDashboard();
    const interval = setInterval(() => void fetchDashboard(), 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [router, reloadKey]);

  if (loading || authLoading) {
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

  const quickActions = [
    { label: "Create Project", href: "/forge/create", icon: <Icon name="plus" size={20} /> },
    { label: "View Tasks",     href: "/tasks",        icon: <Icon name="tasks" size={20} /> },
    { label: "Deployments",    href: "/deploys",      icon: <Icon name="rocket" size={20} /> },
  ];

  // No data and the load failed: say so instead of reading the missing
  // summary as "not configured" for every service.
  if (!data && loadFailed) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description={user ? `Welcome, ${user.name || user.email}` : "Welcome"}
        />
        <Card className="border-accent-red/50 p-4 mb-8" role="alert">
          <p className="text-sm font-medium text-accent-red">Could not load the service summary</p>
          <p className="text-sm text-content-secondary mt-1">
            The dashboard retries every 30 seconds, or you can try again now.
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        </Card>
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
      </>
    );
  }

  const forge = data?.services["project-forge"];
  const tasks = data?.services["agent-tasks"];
  const deploy = data?.services["deploy-panel"];

  const forgeState = serviceState(forge);
  const tasksState = serviceState(tasks);
  const deployState = serviceState(deploy);

  const hints = serviceHintLists([
    { label: "Project Forge", state: forgeState },
    { label: "Agent Tasks", state: tasksState },
    { label: "Deploy Panel", state: deployState },
  ]);

  const stats: StatItem[] = [
    {
      label: "Projects",
      value: tasks?.projectCount,
      subtitle: "via agent-tasks",
      state: tasksState,
      accent: "blue",
    },
    {
      label: "Open Tasks",
      value: tasks?.claimableCount,
      subtitle: "claimable",
      state: tasksState,
      accent: "amber",
    },
    {
      label: "Servers",
      value: deploy?.configured && deploy?.serverCount != null
        ? `${deploy.onlineCount ?? 0}/${deploy.serverCount}`
        : null,
      subtitle: "online / total",
      state: deployState,
      accent: "green",
    },
    {
      label: "Apps",
      value: deploy?.appCount,
      subtitle: "deployed",
      state: deployState,
      accent: "purple",
    },
  ];

  return (
    <>
      {/* PageHeader replaces the ad-hoc welcome <p>. */}
      <PageHeader
        title="Dashboard"
        description={user ? `Welcome, ${user.name || user.email}` : "Welcome"}
      />

      {/* A refresh failed after an earlier success: the cards below are the
          last good data, so say that they may be out of date. */}
      {loadFailed && (
        <Card className="border-accent-amber/50 p-4 mb-4" role="status">
          <p className="text-sm text-accent-amber">
            The latest refresh failed. The figures below are from the last successful load; the
            dashboard retries every 30 seconds.
          </p>
        </Card>
      )}

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
              {forgeState === "unreadable" ? (
                <Badge variant="warning">Credential unreadable</Badge>
              ) : forge?.configured ? (
                <Badge variant="success">Token saved</Badge>
              ) : (
                <Badge variant="neutral">Not configured</Badge>
              )}
            </div>
            <p className="text-xs text-content-tertiary mt-2">Scaffolding service - no live health check</p>
          </Card>
        </div>
      </div>

      {/* Unreadable credential hint: the credential is stored but cannot be
          decrypted (e.g. SESSION_SECRET changed), so it must be entered again. */}
      {(forgeState === "unreadable" || tasksState === "unreadable" || deployState === "unreadable") && (
        <Card className="border-accent-amber/50 p-4 mb-4">
          <p className="text-sm text-accent-amber">
            A stored credential could not be decrypted.{" "}
            <Link href="/settings" className="underline hover:text-accent-amber/80 transition-colors">
              Re-enter it in Settings
            </Link>
          </p>
        </Card>
      )}

      {/* Not configured hint: names the services whose state is not_configured. */}
      {hints.notConfigured.length > 0 && (
        <Card className={`border-accent-amber/50 p-4${hints.unreachable.length > 0 ? " mb-4" : ""}`}>
          <p className="text-sm text-accent-amber">
            Not configured: {hints.notConfigured.join(", ")}.{" "}
            <Link href="/settings" className="underline hover:text-accent-amber/80 transition-colors">
              Add your API tokens in Settings
            </Link>
          </p>
        </Card>
      )}

      {/* Unreachable hint: services that are configured but answered with an
          error. The backend's error string is deliberately not shown here. */}
      {hints.unreachable.length > 0 && (
        <Card className="border-accent-amber/50 p-4">
          <p className="text-sm text-accent-amber">
            Could not reach: {hints.unreachable.join(", ")}.{" "}
            <Link href="/settings" className="underline hover:text-accent-amber/80 transition-colors">
              Check the service or its token in Settings
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
  state: ServiceState;
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-label text-content-tertiary flex items-center gap-1.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${tint.dot} bg-current`} />
            {s.label}
          </span>
          {s.state === "not_configured" ? (
            <Badge variant="neutral">Not configured</Badge>
          ) : s.state === "unreadable" ? (
            <Badge variant="warning">Credential unreadable</Badge>
          ) : s.state === "error" ? (
            <Badge variant="error">Error</Badge>
          ) : (
            <Badge variant="success">Connected</Badge>
          )}
        </div>
        <p className="text-2xl font-semibold text-content-primary mt-1">
          {s.state === "not_configured" ? (
            // Not configured: the value does not exist, so show a word like the
            // error branch instead of the dot.
            <span className="text-base font-medium text-content-secondary">Not set</span>
          ) : s.state === "error" ? (
            // Error state: the value is unknown because the service could not
            // be reached, so show the word instead of the dot. The backend's
            // error string is not rendered.
            <span className="text-base font-medium text-content-secondary">Unavailable</span>
          ) : (
            s.value ?? "·"
          )}
        </p>
        <p className="text-xs text-content-tertiary mt-1">{s.subtitle}</p>
      </Card>
    </div>
  );
}
