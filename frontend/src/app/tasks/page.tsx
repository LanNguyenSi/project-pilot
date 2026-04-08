"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  claimedByAgent?: { name: string } | null;
  claimedByUser?: { email: string } | null;
  createdAt: string;
}

export default function TasksPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/api/tasks/projects")
      .then((data) => {
        setProjects(data.projects);
        if (data.projects.length > 0) {
          setSelectedProject(data.projects[0].id);
        }
      })
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    apiFetch<{ tasks: Task[] }>(`/api/tasks/projects/${selectedProject}/tasks`)
      .then((data) => setTasks(data.tasks))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedProject]);

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

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <a href="/dashboard" className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700">
            Dashboard
          </a>
        </div>

        {error && (
          <div className="rounded-lg bg-gray-900 border border-red-800/50 p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Project selector */}
        {projects.length > 0 && (
          <div className="mb-6">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="rounded-lg bg-gray-900 border border-gray-700 px-4 py-2 text-sm focus:outline-none focus:border-gray-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.description}
                </option>
              ))}
            </select>
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
