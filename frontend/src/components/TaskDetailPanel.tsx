"use client";

import { useEffect, useState, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { Badge, Card, ErrorBanner, Icon, SkeletonBox, useFocusTrap } from "@/components/ui";
import { statusMap, priorityMap } from "@/lib/task-constants";

interface TemplateData {
  goal?: string;
  acceptanceCriteria?: string;
  context?: string;
  constraints?: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  authorUser?: { login: string; name: string | null } | null;
  authorAgent?: { name: string } | null;
}

interface Attachment {
  id: string;
  name: string;
  url: string;
}

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  templateData: TemplateData | null;
  claimedByUser?: { login: string; name: string | null } | null;
  claimedByAgent?: { name: string } | null;
  branchName: string | null;
  prUrl: string | null;
  prNumber: number | null;
  createdAt: string;
  updatedAt: string;
  comments?: Comment[];
  attachments?: Attachment[];
}

interface InstructionsData {
  confidence?: { score: number; missing: string[]; threshold: number };
  allowedTransitions?: { to: string; label: string }[];
  recommendedAction?: string;
}

interface TaskDetailPanelProps {
  taskId: string;
  open: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

export function TaskDetailPanel({ taskId, open, onClose }: TaskDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [instructions, setInstructions] = useState<InstructionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Portal to document.body so the drawer's `fixed inset-0` is viewport-relative
  // rather than scoped to AppShell's <main>, which keeps a persistent transform from
  // animate-fade-in (fill-mode: both). Inline, that transform trapped the overlay in
  // <main>'s box: the backdrop did not cover the sidebar and the panel could not
  // scroll to the bottom. The mounted flag keeps server + first client render null
  // (no hydration mismatch, no document.body access during prerender).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useFocusTrap(panelRef, open && mounted, onClose);

  useEffect(() => {
    if (!open || !taskId) return;
    setLoading(true);
    setError("");
    setTask(null);

    Promise.all([
      apiFetch<{ task: TaskDetail }>(`/api/tasks/${encodeURIComponent(taskId)}`),
      apiFetch<InstructionsData>(`/api/tasks/${encodeURIComponent(taskId)}/instructions`).catch(() => null),
    ])
      .then(([taskData, instrData]) => {
        setTask(taskData.task);
        setInstructions(instrData);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, taskId]);

  if (!open || !mounted) return null;

  const status = task ? statusMap[task.status] || { label: task.status, variant: "neutral" as const } : null;
  const priority = task ? priorityMap[task.priority] || { label: task.priority, color: "text-content-secondary" } : null;
  const confidence = instructions?.confidence;
  const assignee = task?.claimedByAgent?.name || task?.claimedByUser?.login || task?.claimedByUser?.name || null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* The panel (not the dialog) is the scroll region: the portaled dialog is
          exactly viewport-sized, so the panel fills the viewport height and scrolls
          its own content. Do not move overflow to the dialog as Modal does. */}
      <div
        ref={panelRef}
        className="relative bg-surface-secondary border-l border-stroke-default shadow-elevated w-full max-w-xl overflow-y-auto animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface-secondary/95 backdrop-blur-sm border-b border-stroke-default px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0 flex-1">
            {loading ? (
              <SkeletonBox className="h-5 w-48" />
            ) : (
              <h2 id={titleId} className="text-sm font-semibold text-content-primary">{task?.title}</h2>
            )}
            {!loading && task && (
              <div className="flex items-center gap-2 mt-2">
                {status && <Badge variant={status.variant} dot>{status.label}</Badge>}
                {priority && <span className={`text-xs font-medium ${priority.color}`}>{priority.label}</span>}
                {confidence && (
                  <span className={`text-xs font-medium tabular-nums ${
                    confidence.score >= 70 ? "text-accent-green" : confidence.score >= 40 ? "text-accent-amber" : "text-accent-red"
                  }`}>
                    Confidence: {confidence.score}%
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-content-tertiary hover:text-content-primary transition-colors duration-fast p-1 rounded-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            aria-label="Close"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {error && (
            <div className="mb-4">
              <ErrorBanner message={error} />
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              <SkeletonBox className="h-4 w-full" />
              <SkeletonBox className="h-4 w-3/4" />
              <SkeletonBox className="h-20 w-full" />
              <SkeletonBox className="h-4 w-1/2" />
            </div>
          ) : task && (
            <>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <span className="text-xs text-content-tertiary">Assignee</span>
                  <p className="text-sm text-content-primary">{assignee || "Unassigned"}</p>
                </div>
                <div>
                  <span className="text-xs text-content-tertiary">Created</span>
                  <p className="text-sm text-content-primary">{new Date(task.createdAt).toLocaleDateString()}</p>
                </div>
                {task.branchName && (
                  <div>
                    <span className="text-xs text-content-tertiary">Branch</span>
                    <p className="text-sm text-content-primary font-mono truncate">{task.branchName}</p>
                  </div>
                )}
                {task.prUrl && (
                  <div>
                    <span className="text-xs text-content-tertiary">Pull Request</span>
                    <a
                      href={task.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-300 hover:text-brand-200 hover:underline"
                    >
                      #{task.prNumber}
                    </a>
                  </div>
                )}
              </div>

              {/* Description */}
              {task.description && (
                <Section title="Description">
                  <p className="text-sm text-content-secondary whitespace-pre-wrap">{task.description}</p>
                </Section>
              )}

              {/* Template Data */}
              {task.templateData && (
                <>
                  {task.templateData.goal && (
                    <Section title="Goal">
                      <p className="text-sm text-content-secondary whitespace-pre-wrap">{task.templateData.goal}</p>
                    </Section>
                  )}
                  {task.templateData.acceptanceCriteria && (
                    <Section title="Acceptance Criteria">
                      <p className="text-sm text-content-secondary whitespace-pre-wrap">{task.templateData.acceptanceCriteria}</p>
                    </Section>
                  )}
                  {task.templateData.context && (
                    <Section title="Context">
                      <p className="text-sm text-content-secondary whitespace-pre-wrap">{task.templateData.context}</p>
                    </Section>
                  )}
                  {task.templateData.constraints && (
                    <Section title="Constraints">
                      <p className="text-sm text-content-secondary whitespace-pre-wrap">{task.templateData.constraints}</p>
                    </Section>
                  )}
                </>
              )}

              {/* Recommended Action */}
              {instructions?.recommendedAction && (
                <Section title="Recommended Action">
                  <Card className="bg-accent-blue/5 border-accent-blue/20">
                    <p className="text-sm text-content-secondary">{instructions.recommendedAction}</p>
                  </Card>
                </Section>
              )}

              {/* Attachments */}
              {task.attachments && task.attachments.length > 0 && (
                <Section title="Attachments">
                  <div className="space-y-1">
                    {task.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-brand-300 hover:text-brand-200 hover:underline"
                      >
                        <Icon name="paperclip" size={16} className="shrink-0" />
                        {a.name}
                      </a>
                    ))}
                  </div>
                </Section>
              )}

              {/* Comments */}
              {task.comments && task.comments.length > 0 && (
                <Section title={`Comments (${task.comments.length})`}>
                  <div className="space-y-3">
                    {task.comments.map((comment) => (
                      <div key={comment.id} className="border border-stroke-default rounded-button p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-content-primary">
                            {comment.authorAgent?.name || comment.authorUser?.login || "Unknown"}
                          </span>
                          <span className="text-xs text-content-tertiary">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-content-secondary whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Confidence Missing Fields */}
              {confidence && confidence.missing.length > 0 && (
                <Section title="Missing for higher confidence">
                  <div className="flex flex-wrap gap-1.5">
                    {confidence.missing.map((field) => (
                      <Badge key={field} variant="neutral">{field}</Badge>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
