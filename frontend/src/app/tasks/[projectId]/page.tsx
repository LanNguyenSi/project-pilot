"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

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

const statusColor: Record<string, string> = {
  open: "text-blue-400",
  in_progress: "text-yellow-400",
  review: "text-purple-400",
  done: "text-green-400",
};

const priorityColor: Record<string, string> = {
  CRITICAL: "text-red-400",
  HIGH: "text-orange-400",
  MEDIUM: "text-yellow-400",
  LOW: "text-gray-400",
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
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{project?.name || "Project"}</h1>
            {project?.description && (
              <p className="text-sm text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={`/tasks/${projectId}/create`}
              className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-gray-200"
            >
              Create Task
            </a>
            <a href="/tasks" className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700">
              All Projects
            </a>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-gray-900 border border-red-800/50 p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : tasks.length === 0 ? (
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-8 text-center">
            <p className="text-gray-400">No tasks in this project</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-lg bg-gray-900 border border-gray-800 p-4 flex items-center gap-4">
                <span className={`text-xs font-medium w-20 ${statusColor[t.status] || "text-gray-400"}`}>
                  {t.status}
                </span>
                <span className={`text-xs font-medium w-16 ${priorityColor[t.priority] || "text-gray-400"}`}>
                  {t.priority}
                </span>
                <span className="flex-1 text-sm">{t.title}</span>
                <span className="text-xs text-gray-500">
                  {t.claimedByAgent?.name || t.claimedByUser?.email || "unassigned"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
