"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

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

const statusBadge: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "info" },
  in_progress: { label: "In Progress", variant: "warning" },
  review: { label: "Review", variant: "purple" },
  done: { label: "Done", variant: "success" },
};

const priorityBadge: Record<string, { label: string; variant: BadgeVariant }> = {
  CRITICAL: { label: "Critical", variant: "error" },
  HIGH: { label: "High", variant: "warning" },
  MEDIUM: { label: "Medium", variant: "neutral" },
  LOW: { label: "Low", variant: "neutral" },
};

export default function ProjectTasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-page-title text-content-primary">{project?.name || "Project"}</h1>
          {project?.description && (
            <p className="text-sm text-content-secondary mt-1">{project.description}</p>
          )}
        </div>
        <Button href={`/tasks/${projectId}/create`}>Create Task</Button>
      </div>

      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {loading ? (
        <p className="text-content-secondary">Loading...</p>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-content-secondary">No tasks in this project</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const status = statusBadge[t.status] || { label: t.status, variant: "neutral" as const };
            const priority = priorityBadge[t.priority] || { label: t.priority, variant: "neutral" as const };
            return (
              <Card key={t.id} className="flex items-center gap-4">
                <Badge variant={status.variant} dot>{status.label}</Badge>
                <Badge variant={priority.variant}>{priority.label}</Badge>
                <span className="flex-1 text-sm text-content-primary">{t.title}</span>
                <span className="text-xs text-content-tertiary">
                  {t.claimedByAgent?.name || t.claimedByUser?.email || "unassigned"}
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
