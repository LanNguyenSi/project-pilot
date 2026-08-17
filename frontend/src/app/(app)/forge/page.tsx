"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import Link from "next/link";
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorBanner, Icon, Modal, Select, SkeletonBox, useToast } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";

interface MigrateResult {
  projectId: string;
  projectCreated: boolean;
  taskCount: number;
  created: number;
  skipped: number;
  failed: number;
  warnings?: string[];
}

interface Team {
  id: string;
  name: string;
}

interface Project {
  id: string;
  repoUrl: string;
  projectName: string;
  description?: string | null;
  createdAt: string;
}

interface TasksProject {
  id: string;
  name: string;
  githubRepo: string | null;
}

export default function ForgePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksProjects, setTasksProjects] = useState<TasksProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [migratingRepo, setMigratingRepo] = useState<string | null>(null);
  // Set when the user belongs to >1 agent-tasks team and must pick one before
  // we can create the project. Holds the repo being migrated + the team list.
  const [teamPicker, setTeamPicker] = useState<{ repoUrl: string; teams: Team[] } | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");

  function findTasksProject(repoUrl: string): TasksProject | undefined {
    // Extract owner/repo from GitHub URL
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!match) return undefined;
    const ownerRepo = match[1].replace(/\.git$/, "");
    return tasksProjects.find((tp) => tp.githubRepo === ownerRepo);
  }

  async function refreshTasksProjects() {
    const data = await apiFetch<{ projects: TasksProject[] }>("/api/tasks/projects").catch(() => ({ projects: [] }));
    setTasksProjects(data.projects);
  }

  async function handleMigrate(repoUrl: string, teamId?: string) {
    setMigratingRepo(repoUrl);
    try {
      const result = await apiFetch<MigrateResult>("/api/forge/migrate-tasks", {
        method: "POST",
        body: JSON.stringify({ repoUrl, ...(teamId ? { teamId } : {}) }),
      });
      setTeamPicker(null);
      // Notices from the dependency-aware import path — genuinely dropped
      // dangling dependsOn edges, or 409-skipped tasks whose OWN dependsOn
      // edges were never applied (create-time only). Either means the final
      // dependency graph is missing edges the operator may need to know
      // about, so this uses the stronger error variant (longer, non-grey)
      // rather than a quiet subline on an otherwise-success toast.
      const description = result.warnings && result.warnings.length > 0 ? result.warnings.join("; ") : undefined;
      if (result.failed > 0) {
        toast({
          title: `${result.created} migrated, ${result.failed} failed - try again to retry the rest`,
          description,
          variant: "error",
        });
      } else {
        const summary =
          result.created > 0
            ? `${result.created} task${result.created === 1 ? "" : "s"} migrated` +
              (result.skipped > 0 ? `, ${result.skipped} already present` : "")
            : result.taskCount === 0
              ? "No tasks to migrate"
              : `All ${result.taskCount} tasks already present`;
        toast({ title: summary, description, variant: description ? "error" : "success" });
      }
      await refreshTasksProjects();
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "multiple_teams" && Array.isArray(err.body.teams)) {
        const teams = err.body.teams as Team[];
        setTeamPicker({ repoUrl, teams });
        setSelectedTeamId(teams[0]?.id ?? "");
        return;
      }
      toast({ title: err instanceof Error ? err.message : "Migration failed", variant: "error" });
    } finally {
      setMigratingRepo(null);
    }
  }

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
    Promise.all([
      apiFetch<{ projects: Project[] }>("/api/forge/projects"),
      apiFetch<{ projects: TasksProject[] }>("/api/tasks/projects").catch(() => ({ projects: [] })),
    ])
      .then(([forgeData, tasksData]) => {
        setProjects(forgeData.projects);
        setTasksProjects(tasksData.projects);
      })
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
          <SkeletonBox className="h-9 w-28" />
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
      <PageHeader
        title="Forge"
        description="Scaffold and manage GitHub projects, then link them to agent-tasks."
        actions={
          <Button href="/forge/create">
            <Icon name="plus" size={16} className="mr-1" />
            New Project
          </Button>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {projects.length === 0 && !error ? (
        <EmptyState
          icon={<Icon name="hammer" size={48} />}
          title="No projects yet"
          description="Create your first project to scaffold a new repository."
          actionLabel="Create your first project"
          actionHref="/forge/create"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p, i) => {
            const linkedProject = findTasksProject(p.repoUrl);
            return (
              <Card
                key={p.id}
                className="group relative animate-fade-in"
                style={{ "--delay": `${i * 40}ms` } as React.CSSProperties}
              >
                <h3 className="font-medium text-sm text-content-primary">{p.projectName}</h3>
                {p.description && (
                  <p className="text-xs text-content-secondary mt-1 line-clamp-2">{p.description}</p>
                )}
                <p className="text-xs text-content-tertiary mt-1">
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
                {linkedProject ? (
                  <Link href={`/tasks/${linkedProject.id}`} className="inline-flex items-center gap-1 mt-2 text-xs text-accent-blue hover:underline">
                    <Badge variant="info">Tasks</Badge>
                    <span>{linkedProject.name}</span>
                  </Link>
                ) : (
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={migratingRepo === p.repoUrl}
                      onClick={() => handleMigrate(p.repoUrl)}
                    >
                      Migrate tasks
                    </Button>
                  </div>
                )}
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
            );
          })}
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

      <Modal open={!!teamPicker} onClose={() => setTeamPicker(null)} title="Choose a team">
        <p className="text-sm text-content-secondary mb-4">
          You belong to multiple teams. Pick which one the new tasks project should live in.
        </p>
        <Select
          label="Team"
          value={selectedTeamId}
          onChange={setSelectedTeamId}
          options={(teamPicker?.teams ?? []).map((t) => ({ value: t.id, label: t.name }))}
        />
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" className="flex-1" onClick={() => setTeamPicker(null)}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!selectedTeamId}
            loading={migratingRepo === teamPicker?.repoUrl}
            onClick={() => teamPicker && handleMigrate(teamPicker.repoUrl, selectedTeamId)}
          >
            Migrate
          </Button>
        </div>
      </Modal>
    </>
  );
}
