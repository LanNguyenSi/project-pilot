"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EmptyState, ErrorBanner, Icon, Select, SkeletonRow } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import { statusMap, priorityMap, priorityBar, PRIORITY_ORDER } from "@/lib/task-constants";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimedByAgent?: { name: string } | null;
  claimedByUser?: { email: string } | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
}

type StatusFilter = "all" | "open" | "in_progress" | "review" | "done";
type ViewMode = "list" | "board";
type SortField = "createdAt" | "priority" | "title";
type SortDir = "asc" | "desc";

const STATUSES: StatusFilter[] = ["open", "in_progress", "review", "done"];
const VIEW_KEY = "project-pilot:task-view";
const TASKS_PER_PAGE = 20;

const SORT_OPTIONS = [
  { value: "createdAt-desc", label: "Newest first" },
  { value: "createdAt-asc",  label: "Oldest first" },
  { value: "priority-asc",   label: "Priority: High to Low" },
  { value: "priority-desc",  label: "Priority: Low to High" },
  { value: "title-asc",      label: "Title: A to Z" },
  { value: "title-desc",     label: "Title: Z to A" },
];

export default function ProjectTasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(VIEW_KEY) as ViewMode) || "list";
    }
    return "list";
  });

  useEffect(() => {
    if (!projectId) return;

    Promise.all([
      apiFetch<{ projects: Project[] }>("/api/tasks/projects"),
      apiFetch<{ tasks: Task[] }>(`/api/tasks/projects/${encodeURIComponent(projectId)}/tasks`),
    ])
      .then(([projectsData, tasksData]) => {
        const found = projectsData.projects.find((p) => p.id === projectId);
        if (found) {
          setProject(found);
          setTasks(tasksData.tasks);
        } else {
          setError("Project not found");
        }
      })
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [projectId, router]);

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "priority") {
      const cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      if (cmp !== 0) return dir * cmp;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === "title") {
      return dir * a.title.localeCompare(b.title);
    }
    return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }), [filtered, sortBy, sortDir]);

  const totalPages = Math.ceil(sorted.length / TASKS_PER_PAGE);
  const paginated = useMemo(() => sorted.slice(page * TASKS_PER_PAGE, (page + 1) * TASKS_PER_PAGE), [sorted, page]);

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In Progress" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" },
  ];

  return (
    <>
      <PageHeader
        title={project?.name ?? "Project"}
        description={project?.description || undefined}
        actions={
          <Button href={`/tasks/${projectId}/create`}>
            <Icon name="plus" size={16} className="mr-1" />
            Create Task
          </Button>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Filter bar + View toggle */}
      {!loading && tasks.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          {view === "list" ? (
            <div className="flex items-center gap-3">
              <div className="flex gap-1" role="toolbar" aria-label="Filter by status">
                {statusFilters.map((f) => (
                  <button
                    key={f.key}
                    aria-pressed={filter === f.key}
                    onClick={() => { setFilter(f.key); setPage(0); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-button transition-colors duration-fast ${
                      filter === f.key
                        ? "bg-brand-500/10 text-brand-300"
                        : "text-content-tertiary hover:text-content-primary hover:bg-surface-overlay"
                    }`}
                  >
                    {f.label}
                    {f.key !== "all" && (
                      <span className="ml-1 text-content-tertiary">
                        {tasks.filter((t) => t.status === f.key).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <Select
                value={`${sortBy}-${sortDir}`}
                onChange={(v) => {
                  const dashIdx = v.lastIndexOf("-");
                  const field = v.slice(0, dashIdx) as SortField;
                  const dir = v.slice(dashIdx + 1) as SortDir;
                  setSortBy(field);
                  setSortDir(dir);
                  setPage(0);
                }}
                options={SORT_OPTIONS}
                className="w-44"
              />
            </div>
          ) : (
            <div />
          )}
          <div className="flex gap-1 border border-stroke-default rounded-button p-0.5">
            <button
              onClick={() => { setView("list"); localStorage.setItem(VIEW_KEY, "list"); }}
              className={`px-2.5 py-1 text-xs font-medium rounded-button transition-colors ${view === "list" ? "bg-surface-overlay text-content-primary" : "text-content-tertiary hover:text-content-primary"}`}
              aria-label="List view"
            >
              List
            </button>
            <button
              onClick={() => { setView("board"); setFilter("all"); localStorage.setItem(VIEW_KEY, "board"); }}
              className={`px-2.5 py-1 text-xs font-medium rounded-button transition-colors ${view === "board" ? "bg-surface-overlay text-content-primary" : "text-content-tertiary hover:text-content-primary"}`}
              aria-label="Board view"
            >
              Board
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div role="status" aria-label="Loading">
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)}
          </div>
          <span className="sr-only">Loading</span>
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Icon name="check-circle" size={48} />}
          title="No tasks yet"
          description="Create your first task to start tracking work for this project."
          actionLabel="Create Task"
          actionHref={`/tasks/${projectId}/create`}
        />
      ) : view === "board" ? (
        /* Board view */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUSES.map((col) => {
            const colStatus = statusMap[col] || { label: col, variant: "neutral" as const };
            const colTasks = tasks.filter((t) => t.status === col);
            return (
              <div key={col}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Badge variant={colStatus.variant} dot>{colStatus.label}</Badge>
                  <span className="text-xs text-content-tertiary tabular-nums">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => {
                    const barColor = priorityBar[t.priority] || "bg-surface-overlay";
                    return (
                      <Card
                        key={t.id}
                        noPadding
                        className="overflow-hidden cursor-pointer hover:border-stroke-strong transition-colors"
                        onClick={() => setSelectedTaskId(t.id)}
                      >
                        <div className="flex">
                          <div className={`w-1 shrink-0 ${barColor}`} />
                          <div className="p-3 min-w-0 flex-1">
                            <p className="text-sm font-medium text-content-primary truncate mb-1">{t.title}</p>
                            <div className="flex items-center gap-2 text-xs text-content-tertiary">
                              <span>{priorityMap[t.priority]?.label || t.priority}</span>
                              <span className="truncate">{t.claimedByAgent?.name || t.claimedByUser?.email || "·"}</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-content-tertiary text-center py-4">·</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-content-secondary text-sm">No {filter.replaceAll("_", " ")} tasks</p>
        </Card>
      ) : (
        /* List view */
        <>
          <div className="space-y-2">
            {paginated.map((t) => {
              const status = statusMap[t.status] || { label: t.status, variant: "neutral" as const };
              const barColor = priorityBar[t.priority] || "bg-surface-overlay";
              return (
                <Card key={t.id} noPadding className="overflow-hidden cursor-pointer hover:border-stroke-strong transition-colors" onClick={() => setSelectedTaskId(t.id)}>
                  <div className="flex">
                    <div className={`w-1 shrink-0 ${barColor}`} />
                    <div className="flex-1 p-4 flex items-center gap-4 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-content-primary truncate">{t.title}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-content-tertiary">
                          <span>{priorityMap[t.priority]?.label || t.priority}</span>
                          <span>{t.claimedByAgent?.name || t.claimedByUser?.email || "Unassigned"}</span>
                          <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Badge variant={status.variant} dot>{status.label}</Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-xs text-content-tertiary">
                {page * TASKS_PER_PAGE + 1}-{Math.min((page + 1) * TASKS_PER_PAGE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          open={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
}
