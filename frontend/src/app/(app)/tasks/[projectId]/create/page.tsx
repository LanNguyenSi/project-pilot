"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button, Card, Input, Textarea, Select, Collapsible, useToast } from "@/components/ui";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
}

const priorityOptions = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export default function CreateTaskPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { toast } = useToast();
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
      toast({ title: "Task created", variant: "success" });
      router.push(`/tasks/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-page-title text-content-primary">Create Task</h1>
        {project && (
          <p className="text-sm text-content-secondary mt-1">{project.name}</p>
        )}
      </div>

      {error && (
        <Card className="border-accent-red/50 mb-6">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <Input
          label="Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
        />

        <Select
          label="Priority"
          options={priorityOptions}
          value={priority}
          onChange={setPriority}
        />

        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the task..."
        />

        <Card>
          <Collapsible trigger="Template Fields (optional)">
            <div className="space-y-4">
              <Textarea
                label="Goal"
                rows={2}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What should be achieved?"
              />
              <Textarea
                label="Acceptance Criteria (one per line)"
                rows={3}
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                placeholder={"Backend endpoint works\nFrontend form submits\nMCP tool registered"}
              />
              <Textarea
                label="Context"
                rows={2}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Background information..."
              />
              <Textarea
                label="Constraints (one per line)"
                rows={2}
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder={"Must use existing patterns\nNo new dependencies"}
              />
            </div>
          </Collapsible>
        </Card>

        <Button
          type="submit"
          loading={submitting}
          disabled={!project}
          className="w-full"
          size="lg"
        >
          Create Task
        </Button>
      </form>
    </>
  );
}
