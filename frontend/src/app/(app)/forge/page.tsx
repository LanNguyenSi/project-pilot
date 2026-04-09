"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button, Card, ConfirmModal, EmptyState, SkeletonBox, useToast } from "@/components/ui";

interface Project {
  id: string;
  repoUrl: string;
  projectName: string;
  createdAt: string;
}

export default function ForgePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/forge/projects/${deleteTarget.id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast({ title: `"${deleteTarget.projectName}" removed`, variant: "success" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to delete", variant: "error" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/api/forge/projects")
      .then((data) => setProjects(data.projects))
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div role="status" aria-label="Loading">
        <div className="flex items-center justify-between mb-8">
          <SkeletonBox className="h-7 w-24" />
          <SkeletonBox className="h-9 w-28 rounded-button" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i} className="space-y-2">
              <SkeletonBox className="h-4 w-32" />
              <SkeletonBox className="h-3 w-20" />
            </Card>
          ))}
        </div>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-page-title text-content-primary">Forge</h1>
          <p className="text-content-secondary text-sm mt-1">Created via Project Forge</p>
        </div>
        <Button href="/forge/create">New Project</Button>
      </div>

      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {projects.length === 0 && !error ? (
        <EmptyState
          icon={<HammerIcon />}
          title="No projects yet"
          description="Create your first project to scaffold a new repository."
          actionLabel="Create your first project"
          actionHref="/forge/create"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="group relative">
              <h3 className="font-medium text-sm text-content-primary">{p.projectName}</h3>
              <p className="text-xs text-content-tertiary mt-1">
                {new Date(p.createdAt).toLocaleDateString()}
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  href={p.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-accent-red hover:text-accent-red/80 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity duration-fast"
                  onClick={() => setDeleteTarget(p)}
                >
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove project"
        description={`Remove "${deleteTarget?.projectName}" from the list? This does not delete the GitHub repository.`}
        confirmLabel="Remove"
        variant="danger"
        loading={deleting}
      />
    </>
  );
}

function HammerIcon() {
  return (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384 3.073A.75.75 0 015.25 17.7V6.3a.75.75 0 01.786-.543l5.384 3.073m0 0l5.384-3.073A.75.75 0 0118.75 6.3v11.4a.75.75 0 01-.786.543l-5.384-3.073m0 0V3.75m0 11.42V20.25" />
    </svg>
  );
}
