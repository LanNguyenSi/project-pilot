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

export default function TaskProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/api/tasks/projects")
      .then((data) => setProjects(data.projects))
      .catch((err: Error) => {
        if (err.message.includes("401")) return router.push("/login");
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

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

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : projects.length === 0 ? (
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-8 text-center">
            <p className="text-gray-400">No projects found</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <a
                key={p.id}
                href={`/tasks/${p.id}`}
                className="rounded-lg bg-gray-900 border border-gray-800 p-4 hover:border-gray-600 transition-colors"
              >
                <h2 className="font-medium text-sm mb-1">{p.name}</h2>
                {p.description && (
                  <p className="text-xs text-gray-500 line-clamp-2">{p.description}</p>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
