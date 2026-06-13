"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, EmptyState, ErrorBanner, Icon, Input, Modal, Select, SkeletonProjectCard, Textarea, useToast } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface Team {
  id: string;
  name: string;
  slug: string;
}

const PROJECTS_PER_PAGE = 18;

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export default function TaskProjectsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [syncingTeamId, setSyncingTeamId] = useState<string | null>(null);
  // Controlled value for the multi-team sync picker (resets to "" after selection)
  const [syncTeamValue, setSyncTeamValue] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newGithubRepo, setNewGithubRepo] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const fetchData = useCallback(async () => {
    const [projectsData, teamsData] = await Promise.all([
      apiFetch<{ projects: Project[] }>("/api/tasks/projects"),
      apiFetch<{ teams: Team[] }>("/api/tasks/teams").catch(() => ({ teams: [] as Team[] })),
    ]);
    setProjects(projectsData.projects);
    setTeams(teamsData.teams);
  }, []);

  useEffect(() => {
    fetchData()
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [fetchData, router]);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
    );
  }, [projects, search]);

  const totalPages = Math.ceil(filtered.length / PROJECTS_PER_PAGE);
  const paginated = useMemo(
    () => filtered.slice(page * PROJECTS_PER_PAGE, (page + 1) * PROJECTS_PER_PAGE),
    [filtered, page],
  );

  function resetCreateForm() {
    setNewTeamId(teams.length === 1 && teams[0] ? teams[0].id : "");
    setNewName("");
    setNewSlug("");
    setSlugTouched(false);
    setNewGithubRepo("");
    setNewDescription("");
    setCreateError("");
  }

  function openCreateModal() {
    resetCreateForm();
    setCreateOpen(true);
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    const name = newName.trim();
    const slug = (slugTouched ? newSlug : toSlug(newName)).trim();
    if (!newTeamId) { setCreateError("Team is required"); return; }
    if (!name) { setCreateError("Name is required"); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setCreateError("Slug must be lowercase alphanumeric with dashes");
      return;
    }
    const repo = newGithubRepo.trim();
    if (repo && !/^[^/]+\/[^/]+$/.test(repo)) {
      setCreateError("GitHub repo must be in the format owner/repo");
      return;
    }
    setCreateSubmitting(true);
    try {
      await apiFetch("/api/tasks/projects", {
        method: "POST",
        body: JSON.stringify({
          teamId: newTeamId,
          name,
          slug,
          githubRepo: repo || undefined,
          description: newDescription.trim() || undefined,
        }),
      });
      toast({ title: `Project "${name}" created`, variant: "success" });
      setCreateOpen(false);
      setPage(0);
      await fetchData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleSync(teamId: string) {
    setSyncingTeamId(teamId);
    try {
      const data = await apiFetch<{
        synced?: number;
        created?: number;
        updated?: number;
        pruned?: number;
        skippedPrune?: boolean;
        message?: string;
      }>(`/api/tasks/teams/${encodeURIComponent(teamId)}/sync`, { method: "POST" });
      toast({
        title: data.message ?? `Synced ${data.created ?? 0} created, ${data.updated ?? 0} updated`,
        variant: "success",
      });
      setPage(0);
      await fetchData();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "GitHub sync failed",
        variant: "error",
      });
    } finally {
      setSyncingTeamId(null);
    }
  }

  const canAct = teams.length > 0;
  const hasOneTeam = teams.length === 1;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Browse projects and track task progress across your teams."
        actions={
          canAct ? (
            <Button size="sm" onClick={openCreateModal}>
              <Icon name="plus" size={16} className="mr-1" />
              New Project
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Loading">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <SkeletonProjectCard key={i} />)}
          </div>
          <span className="sr-only">Loading</span>
        </div>
      ) : (
        <>
          {/* Sync action row */}
          {canAct && (
            <div className="flex items-center justify-end gap-2 mb-4 flex-wrap">
              {hasOneTeam && teams[0] ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSync(teams[0]!.id)}
                  loading={syncingTeamId === teams[0]!.id}
                  disabled={syncingTeamId !== null}
                >
                  Sync from GitHub
                </Button>
              ) : (
                <Select
                  value={syncTeamValue}
                  placeholder="Sync from GitHub..."
                  onChange={(v) => {
                    if (v) {
                      setSyncTeamValue("");
                      void handleSync(v);
                    }
                  }}
                  options={teams.map((t) => ({
                    value: t.id,
                    label: t.name + (syncingTeamId === t.id ? " (syncing...)" : ""),
                  }))}
                  disabled={syncingTeamId !== null}
                  className="w-48"
                />
              )}
            </div>
          )}

          {projects.length === 0 ? (
            <EmptyState
              icon={<Icon name="folder" size={48} />}
              title="No projects found"
              description={
                canAct
                  ? "Create one, or sync your GitHub account to populate the list."
                  : "Connect your Agent Tasks token in Settings to see projects."
              }
              actionLabel={canAct ? undefined : "Go to Settings"}
              actionHref={canAct ? undefined : "/settings"}
            />
          ) : (
            <>
              {/* Search + count */}
              <div className="flex items-center gap-3 mb-4">
                <Input
                  type="text"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="flex-1 max-w-xs"
                />
                <span className="text-xs text-content-tertiary">
                  {filtered.length} project{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>

              {filtered.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-content-secondary text-sm">No projects matching &ldquo;{search}&rdquo;</p>
                </Card>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {paginated.map((p, i) => (
                      <Link key={p.id} href={`/tasks/${p.id}`}>
                        <Card
                          variant="interactive"
                          className="h-full animate-fade-in"
                          style={{ "--delay": `${i * 30}ms` } as React.CSSProperties}
                        >
                          <h2 className="font-medium text-sm text-content-primary mb-1">{p.name}</h2>
                          {p.description && (
                            <p className="text-xs text-content-secondary line-clamp-2">{p.description}</p>
                          )}
                        </Card>
                      </Link>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <span className="text-xs text-content-tertiary">
                        {page * PROJECTS_PER_PAGE + 1}-{Math.min((page + 1) * PROJECTS_PER_PAGE, filtered.length)} of {filtered.length}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                          Previous
                        </Button>
                        <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => {
          if (createSubmitting) return;
          setCreateOpen(false);
        }}
        title="New Project"
      >
        <form onSubmit={handleCreateProject} className="space-y-3">
          <Select
            label="Team"
            value={newTeamId}
            onChange={setNewTeamId}
            placeholder="Select a team..."
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            disabled={createSubmitting || teams.length === 0}
          />
          <Input
            label="Name"
            required
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (!slugTouched) setNewSlug(toSlug(e.target.value));
            }}
            placeholder="My Project"
            disabled={createSubmitting}
          />
          <Input
            label="Slug"
            required
            value={newSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setNewSlug(e.target.value);
            }}
            placeholder="my-project"
            disabled={createSubmitting}
            hint="Lowercase alphanumeric with dashes. Auto-generated from name; edit to override."
          />
          <Input
            label="GitHub Repo (optional)"
            value={newGithubRepo}
            onChange={(e) => setNewGithubRepo(e.target.value)}
            placeholder="owner/repo"
            disabled={createSubmitting}
          />
          <Textarea
            label="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="What is this project about?"
            disabled={createSubmitting}
            rows={2}
          />
          {createError && (
            <div>
              <ErrorBanner message={createError} />
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={createSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createSubmitting}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
