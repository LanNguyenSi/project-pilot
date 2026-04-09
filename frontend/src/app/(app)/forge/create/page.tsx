"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input, Textarea, useToast } from "@/components/ui";

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

const steps = [
  { key: "form", label: "Configure" },
  { key: "preview", label: "Preview" },
  { key: "done", label: "Publish" },
] as const;

function stepIndex(phase: Phase): number {
  if (phase === "form" || phase === "generating") return 0;
  if (phase === "preview" || phase === "publishing") return 1;
  return 2;
}

export default function CreateProjectPage() {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("form");
  const [projectName, setProjectName] = useState("");
  const [summary, setSummary] = useState("");
  const [features, setFeatures] = useState("");
  const [constraints, setConstraints] = useState("");
  const [error, setError] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [repoUrl, setRepoUrl] = useState("");

  const currentStep = stepIndex(phase);

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
      toast({ title: "Project published to GitHub", variant: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
      setPhase("preview");
    }
  }

  return (
    <>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8 max-w-md">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  i < currentStep
                    ? "bg-accent-green text-white"
                    : i === currentStep
                      ? "bg-accent-purple text-white"
                      : "bg-surface-tertiary text-content-tertiary"
                }`}
              >
                {i < currentStep ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs font-medium ${i <= currentStep ? "text-content-primary" : "text-content-tertiary"}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${i < currentStep ? "bg-accent-green" : "bg-surface-tertiary"}`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      {/* Step 1: Form */}
      {(phase === "form" || phase === "generating") && (
        <Card className="p-6 max-w-2xl">
          <form onSubmit={handleGenerate} className="space-y-4">
            <Input
              label="Project Name"
              required
              pattern="^[a-zA-Z0-9._-]+$"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-project"
              hint="Alphanumeric, dots, hyphens, underscores"
            />
            <Textarea
              label="Summary"
              required
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Describe what this project does..."
            />
            <Textarea
              label="Features (one per line, optional)"
              rows={3}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder={"User authentication\nREST API\nDashboard"}
            />
            <Textarea
              label="Constraints (one per line, optional)"
              rows={2}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder={"Must use TypeScript\nPostgreSQL only"}
            />
            <Button type="submit" loading={phase === "generating"} className="w-full" size="lg">
              Generate Preview
            </Button>
          </form>
        </Card>
      )}

      {/* Step 2: Preview */}
      {(phase === "preview" || phase === "publishing") && preview && (
        <div className="space-y-6 max-w-3xl">
          <Card className="p-6">
            <h2 className="text-section-title text-content-primary mb-1">Tasks ({preview.taskCount})</h2>
            <p className="text-xs text-content-tertiary mb-4">{preview.waveCount} wave(s)</p>
            <div className="space-y-2">
              {preview.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="text-xs bg-surface-tertiary rounded-badge px-2 py-0.5 text-content-secondary">{t.wave}</span>
                  <span className="text-xs bg-surface-tertiary rounded-badge px-2 py-0.5 text-content-secondary">{t.priority}</span>
                  <span className="text-content-primary">{t.title}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-section-title text-content-primary mb-3">Architecture</h2>
            <pre className="text-xs text-content-secondary whitespace-pre-wrap overflow-auto max-h-64 font-mono">{preview.architectureOverview}</pre>
          </Card>

          <Card className="p-6">
            <h2 className="text-section-title text-content-primary mb-3">File Tree</h2>
            <div className="text-xs text-content-secondary font-mono">
              <FileTree nodes={preview.fileTree} />
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => { setPhase("form"); setPreview(null); setSessionId(""); }}
            >
              Back to form
            </Button>
            <Button
              className="flex-1"
              onClick={handlePublish}
              loading={phase === "publishing"}
            >
              Publish to GitHub
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {phase === "done" && (
        <Card className="border-accent-green/50 p-8 text-center max-w-lg mx-auto">
          <div className="text-accent-green mb-3">
            <svg className="h-10 w-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-section-title text-content-primary mb-1">Project Created</h2>
          <p className="text-content-secondary text-sm mb-6">{projectName}</p>
          <div className="flex gap-3 justify-center">
            <Button href={repoUrl} target="_blank" rel="noopener noreferrer">
              Open on GitHub
            </Button>
            <Button variant="secondary" href="/forge">
              All Projects
            </Button>
          </div>
        </Card>
      )}
    </>
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
