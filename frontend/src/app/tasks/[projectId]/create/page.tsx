"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export default function CreateTaskPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [context, setContext] = useState("");
  const [constraints, setConstraints] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/api/tasks/projects")
      .then((data) => {
        const found = data.projects.find((p) => p.id === projectId);
        if (found) setProject(found);
        else setError("Project not found");
      })
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      });
  }, [projectId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const template: Record<string, unknown> = {};
    if (goal) template.goal = goal;
    if (acceptanceCriteria) template.acceptanceCriteria = acceptanceCriteria.split("\n").filter(Boolean);
    if (context) template.context = context;
    if (constraints) template.constraints = constraints.split("\n").filter(Boolean);

    try {
      await apiFetch(`/api/tasks/projects/${encodeURIComponent(projectId)}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          priority,
          description: description || undefined,
          template: Object.keys(template).length > 0 ? template : undefined,
        }),
      });
      router.push(`/tasks/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Create Task</h1>
            {project && (
              <p className="text-sm text-gray-500 mt-1">{project.name}</p>
            )}
          </div>
          <a href={`/tasks/${projectId}`} className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700">
            Back
          </a>
        </div>

        {error && (
          <div className="rounded-lg bg-gray-900 border border-red-800/50 p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500"
            >
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the task..."
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
            />
          </div>

          <details className="rounded-lg bg-gray-900 border border-gray-800 p-4">
            <summary className="text-sm font-medium text-gray-400 cursor-pointer">Template Fields (optional)</summary>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Goal</label>
                <textarea
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="What should be achieved?"
                  className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Acceptance Criteria (one per line)</label>
                <textarea
                  rows={3}
                  value={acceptanceCriteria}
                  onChange={(e) => setAcceptanceCriteria(e.target.value)}
                  placeholder="Backend endpoint works&#10;Frontend form submits&#10;MCP tool registered"
                  className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Context</label>
                <textarea
                  rows={2}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Background information..."
                  className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Constraints (one per line)</label>
                <textarea
                  rows={2}
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  placeholder="Must use existing patterns&#10;No new dependencies"
                  className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
                />
              </div>
            </div>
          </details>

          <button
            type="submit"
            disabled={submitting || !project}
            className="w-full rounded-lg bg-white text-black py-2.5 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Task"}
          </button>
        </form>
      </div>
    </main>
  );
}
