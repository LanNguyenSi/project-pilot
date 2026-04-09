"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Project {
  id: string;
  repoUrl: string;
  projectName: string;
  createdAt: string;
}

export default function ForgePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from list?`)) return;
    try {
      await apiFetch(`/api/forge/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
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
    return <p className="text-content-secondary">Loading...</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-page-title text-content-primary">Forge</h1>
          <p className="text-content-secondary text-sm mt-1">Created via Project Forge</p>
        </div>
        <a href="/forge/create" className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium bg-accent-blue text-white hover:bg-accent-blue/90 rounded-button transition-colors duration-fast">
          New Project
        </a>
      </div>

        {error && (
          <div className="rounded-lg bg-gray-900 border border-red-800/50 p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {projects.length === 0 && !error ? (
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-8 text-center">
            <p className="text-gray-400 mb-4">No projects yet</p>
            <a href="/forge/create" className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-gray-200">
              Create your first project
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <div key={p.id} className="rounded-lg bg-gray-900 border border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{p.projectName}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={p.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
                  >
                    GitHub
                  </a>
                  <button
                    onClick={() => handleDelete(p.id, p.projectName)}
                    className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </>
  );
}
