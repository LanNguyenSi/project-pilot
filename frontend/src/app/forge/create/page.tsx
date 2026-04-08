"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Task {
  id: string;
  title: string;
  wave: string;
  priority: string;
  summary?: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

interface Preview {
  projectName: string;
  tasks: Task[];
  architectureOverview: string;
  fileTree: FileTreeNode[];
  taskCount: number;
  waveCount: number;
}

type Phase = "form" | "generating" | "preview" | "publishing" | "done";

export default function CreateProjectPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("form");
  const [projectName, setProjectName] = useState("");
  const [summary, setSummary] = useState("");
  const [features, setFeatures] = useState("");
  const [constraints, setConstraints] = useState("");
  const [error, setError] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [repoUrl, setRepoUrl] = useState("");

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPhase("generating");

    try {
      const data = await apiFetch<{ sessionId: string; preview: Preview }>("/api/forge/generate", {
        method: "POST",
        body: JSON.stringify({
          projectName,
          summary,
          features: features ? features.split("\n").filter(Boolean) : undefined,
          constraints: constraints ? constraints.split("\n").filter(Boolean) : undefined,
        }),
      });
      setSessionId(data.sessionId);
      setPreview(data.preview);
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setPhase("form");
    }
  }

  async function handlePublish() {
    setError("");
    setPhase("publishing");

    try {
      const data = await apiFetch<{ result: { repoUrl: string } }>("/api/forge/publish", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
      setRepoUrl(data.result.repoUrl);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
      setPhase("preview");
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Create Project</h1>
          <a href="/forge" className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700">
            Back
          </a>
        </div>

        {error && (
          <div className="rounded-lg bg-gray-900 border border-red-800/50 p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Form Phase */}
        {(phase === "form" || phase === "generating") && (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Project Name</label>
              <input
                type="text"
                required
                pattern="^[a-zA-Z0-9._-]+$"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-project"
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Summary</label>
              <textarea
                required
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Describe what this project does..."
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Features (one per line, optional)</label>
              <textarea
                rows={3}
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                placeholder="User authentication&#10;REST API&#10;Dashboard"
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Constraints (one per line, optional)</label>
              <textarea
                rows={2}
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder="Must use TypeScript&#10;PostgreSQL only"
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={phase === "generating"}
              className="w-full rounded-lg bg-white text-black py-2.5 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              {phase === "generating" ? "Generating preview..." : "Generate Preview"}
            </button>
          </form>
        )}

        {/* Preview Phase */}
        {(phase === "preview" || phase === "publishing") && preview && (
          <div className="space-y-6">
            <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
              <h2 className="font-semibold mb-2">Tasks ({preview.taskCount})</h2>
              <p className="text-xs text-gray-500 mb-3">{preview.waveCount} wave(s)</p>
              <div className="space-y-2">
                {preview.tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 text-sm">
                    <span className="text-xs bg-gray-800 rounded px-2 py-0.5 text-gray-400">{t.wave}</span>
                    <span className="text-xs bg-gray-800 rounded px-2 py-0.5 text-gray-400">{t.priority}</span>
                    <span>{t.title}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
              <h2 className="font-semibold mb-2">Architecture</h2>
              <pre className="text-xs text-gray-400 whitespace-pre-wrap overflow-auto max-h-64">
                {preview.architectureOverview}
              </pre>
            </div>

            <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
              <h2 className="font-semibold mb-2">File Tree</h2>
              <div className="text-xs text-gray-400 font-mono">
                <FileTree nodes={preview.fileTree} />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setPhase("form"); setPreview(null); }}
                className="flex-1 rounded-lg bg-gray-800 py-2.5 text-sm hover:bg-gray-700"
              >
                Back to form
              </button>
              <button
                onClick={handlePublish}
                disabled={phase === "publishing"}
                className="flex-1 rounded-lg bg-white text-black py-2.5 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                {phase === "publishing" ? "Publishing..." : "Publish to GitHub"}
              </button>
            </div>
          </div>
        )}

        {/* Done Phase */}
        {phase === "done" && (
          <div className="rounded-lg bg-gray-900 border border-green-800/50 p-8 text-center">
            <h2 className="text-xl font-bold mb-2">Project Created</h2>
            <p className="text-gray-400 mb-4">{projectName}</p>
            <div className="flex gap-3 justify-center">
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:bg-gray-200"
              >
                Open on GitHub
              </a>
              <a href="/forge" className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700">
                All Projects
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function FileTree({ nodes, depth = 0 }: { nodes: FileTreeNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <div style={{ paddingLeft: `${depth * 16}px` }}>
            {node.type === "directory" ? `📁 ${node.name}/` : `  ${node.name}`}
          </div>
          {node.children && <FileTree nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}
