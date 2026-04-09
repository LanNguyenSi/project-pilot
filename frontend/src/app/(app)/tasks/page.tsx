"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, EmptyState, SkeletonProjectCard } from "@/components/ui";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export default function TaskProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/api/tasks/projects")
      .then((data) => setProjects(data.projects))
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <>
      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {loading ? (
        <div role="status" aria-label="Loading">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <SkeletonProjectCard key={i} />)}
          </div>
          <span className="sr-only">Loading</span>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderIcon />}
          title="No projects found"
          description="Connect your Agent Tasks token in Settings to see projects."
          actionLabel="Go to Settings"
          actionHref="/settings"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/tasks/${p.id}`}>
              <Card variant="interactive" className="h-full">
                <h2 className="font-medium text-sm text-content-primary mb-1">{p.name}</h2>
                {p.description && (
                  <p className="text-xs text-content-secondary line-clamp-2">{p.description}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function FolderIcon() {
  return (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}
