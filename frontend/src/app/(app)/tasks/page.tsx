"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, Card, EmptyState, Input, Modal, SkeletonProjectCard, useToast } from "@/components/ui";

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
      ) : (
        <>
          {/* Header actions */}
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
                <select
                  aria-label="Sync team projects from GitHub"
                  className="px-2.5 py-1.5 text-xs rounded-button border border-stroke-default bg-surface-primary text-content-primary"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      void handleSync(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  disabled={syncingTeamId !== null}
                >
                  <option value="">Sync from GitHub…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {syncingTeamId === t.id ? " (syncing…)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <Button size="sm" onClick={openCreateModal}>
                + New Project
              </Button>
            </div>
          )}

          {projects.length === 0 ? (
            <EmptyState
              icon={<FolderIcon />}
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
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="px-3 py-1.5 text-sm rounded-button border border-stroke-default bg-surface-primary text-content-primary placeholder:text-content-tertiary flex-1 max-w-xs"
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
                    {paginated.map((p) => (
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
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <span className="text-xs text-content-tertiary">
                        {page * PROJECTS_PER_PAGE + 1}–{Math.min((page + 1) * PROJECTS_PER_PAGE, filtered.length)} of {filtered.length}
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
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-content-primary">New Project</h2>
          <button
            type="button"
            onClick={() => {
              if (createSubmitting) return;
              setCreateOpen(false);
            }}
            className="text-content-tertiary hover:text-content-primary p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleCreateProject} className="space-y-3">
          <div>
            <label className="block text-xs text-content-secondary mb-1">
              Team <span className="text-accent-red">*</span>
            </label>
            <select
              required
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              disabled={createSubmitting || teams.length === 0}
              className="w-full px-3 py-1.5 text-sm rounded-button border border-stroke-default bg-surface-primary text-content-primary"
            >
              <option value="">Select a team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
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
          <div>
            <label className="block text-xs text-content-secondary mb-1">Description (optional)</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="What is this project about?"
              disabled={createSubmitting}
              rows={2}
              className="w-full px-3 py-1.5 text-sm rounded-button border border-stroke-default bg-surface-primary text-content-primary placeholder:text-content-tertiary"
            />
          </div>
          {createError && <p className="text-sm text-accent-red">{createError}</p>}
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

function FolderIcon() {
  return (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}
