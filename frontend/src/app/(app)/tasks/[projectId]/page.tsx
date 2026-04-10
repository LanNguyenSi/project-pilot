"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EmptyState, SkeletonRow } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";

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

const statusMap: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "info" },
  in_progress: { label: "In Progress", variant: "warning" },
  review: { label: "Review", variant: "purple" },
  done: { label: "Done", variant: "success" },
};

const priorityBar: Record<string, string> = {
  CRITICAL: "bg-accent-red",
  HIGH: "bg-accent-amber",
  MEDIUM: "bg-accent-blue",
  LOW: "bg-surface-tertiary",
};

const priorityLabel: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

type StatusFilter = "all" | "open" | "in_progress" | "review" | "done";
type ViewMode = "list" | "board";

const STATUSES: StatusFilter[] = ["open", "in_progress", "review", "done"];
const VIEW_KEY = "project-pilot:task-view";

export default function ProjectTasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
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

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In Progress" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" },
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        {project?.description && (
          <p className="text-sm text-content-secondary">{project.description}</p>
        )}
        <Button href={`/tasks/${projectId}/create`}>Create Task</Button>
      </div>

      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {/* Filter bar + View toggle */}
      {!loading && tasks.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          {view === "list" ? (
            <div className="flex gap-1" role="toolbar" aria-label="Filter by status">
              {filters.map((f) => (
                <button
                  key={f.key}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-button transition-colors duration-fast ${
                    filter === f.key
                      ? "bg-accent-blue/10 text-accent-blue"
                      : "text-content-tertiary hover:text-content-primary hover:bg-surface-tertiary"
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
          ) : (
            <div />
          )}
          <div className="flex gap-1 border border-stroke-default rounded-button p-0.5">
            <button
              onClick={() => { setView("list"); localStorage.setItem(VIEW_KEY, "list"); }}
              className={`px-2.5 py-1 text-xs font-medium rounded-button transition-colors ${view === "list" ? "bg-surface-tertiary text-content-primary" : "text-content-tertiary hover:text-content-primary"}`}
              aria-label="List view"
            >
              List
            </button>
            <button
              onClick={() => { setView("board"); setFilter("all"); localStorage.setItem(VIEW_KEY, "board"); }}
              className={`px-2.5 py-1 text-xs font-medium rounded-button transition-colors ${view === "board" ? "bg-surface-tertiary text-content-primary" : "text-content-tertiary hover:text-content-primary"}`}
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
          icon={<CheckCircleIcon />}
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
                    const barColor = priorityBar[t.priority] || "bg-surface-tertiary";
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
                              <span>{priorityLabel[t.priority] || t.priority}</span>
                              <span className="truncate">{t.claimedByAgent?.name || t.claimedByUser?.email || "—"}</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-content-tertiary text-center py-4">—</p>
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
        <div className="space-y-2">
          {filtered.map((t) => {
            const status = statusMap[t.status] || { label: t.status, variant: "neutral" as const };
            const barColor = priorityBar[t.priority] || "bg-surface-tertiary";
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
                        <span>{priorityLabel[t.priority] || t.priority}</span>
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

function CheckCircleIcon() {
  return (
    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
