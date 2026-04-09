"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";

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
    <>
      <h1 className="text-page-title text-content-primary mb-6">Tasks</h1>

      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {loading ? (
        <p className="text-content-secondary">Loading...</p>
      ) : projects.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-content-secondary">No projects found</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <a key={p.id} href={`/tasks/${p.id}`}>
              <Card variant="interactive">
                <h2 className="font-medium text-sm text-content-primary mb-1">{p.name}</h2>
                {p.description && (
                  <p className="text-xs text-content-secondary line-clamp-2">{p.description}</p>
                )}
              </Card>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
