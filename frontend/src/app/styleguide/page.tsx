"use client";

/**
 * Styleguide: living design documentation and PR review artifact.
 *
 * Route: /styleguide (outside the (app) auth group, no login required)
 * Shows every primitive in every variant/state, the full type scale,
 * color swatches, and the shadow scale.
 *
 * Screenshot this page for the PR.
 */

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { FilterBar, PillToggleGroup } from "@/components/ui/FilterBar";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { ToastProvider, useToast } from "@/components/ui/Toast";

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="text-section-title font-display text-content-primary mb-5 pb-2 border-b border-stroke-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      {label && <p className="text-xs text-content-tertiary mb-2 font-medium uppercase tracking-widest">{label}</p>}
      <div className="flex flex-wrap gap-3 items-center">{children}</div>
    </div>
  );
}

// ── Toast trigger (needs context) ────────────────────────────────────────────

function ToastTriggers() {
  const { toast } = useToast();
  return (
    <Row label="Toasts">
      <Button size="sm" onClick={() => toast({ title: "Project deployed", description: "v1.2.3 is live", variant: "success" })}>
        Success toast
      </Button>
      <Button size="sm" variant="secondary" onClick={() => toast({ title: "Something went wrong", description: "Check logs for details", variant: "error" })}>
        Error toast
      </Button>
      <Button size="sm" variant="ghost" onClick={() => toast({ title: "Build queued", variant: "info" })}>
        Info toast
      </Button>
    </Row>
  );
}

// ── Main styleguide ──────────────────────────────────────────────────────────

export default function StyleguidePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectVal, setSelectVal] = useState("medium");
  const [pillVal, setPillVal] = useState<"all" | "open" | "done">("all");

  const selectOptions = [
    { value: "low", label: "Low priority" },
    { value: "medium", label: "Medium priority" },
    { value: "high", label: "High priority" },
    { value: "critical", label: "Critical" },
  ];

  const pillOptions: { key: "all" | "open" | "done"; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open", count: 5 },
    { key: "done", label: "Done", count: 12 },
  ];

  return (
    <ToastProvider>
      <div className="min-h-screen bg-surface-base text-content-primary">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <PageHeader
            title="Design System"
            description="Refined Dark v1: component catalogue and design token reference."
            actions={<Badge variant="info">PR1</Badge>}
          />

          {/* ── Color swatches ── */}
          <Section title="Color Tokens">
            <p className="text-body text-content-secondary mb-5">Brand ramp (violet-indigo signature):</p>
            <div className="flex gap-2 flex-wrap mb-6">
              {(
                [
                  ["brand-50",  "bg-brand-50",  "#ece9ff", "50"],
                  ["brand-300", "bg-brand-300", "#b3a6ff", "300"],
                  ["brand-400", "bg-brand-400", "#9a86ff", "400"],
                  ["brand-500", "bg-brand-500", "#6e56f0", "500 (CTA)"],
                  ["brand-600", "bg-brand-600", "#5b43d6", "600"],
                  ["brand-700", "bg-brand-700", "#4a35b0", "700"],
                ] as const
              ).map(([, bg, hex, label]) => (
                <div key={hex} className="text-center">
                  <div className={`w-16 h-16 rounded-card ${bg}`} />
                  <p className="text-xs text-content-secondary mt-1">{label}</p>
                  <p className="text-xs text-content-tertiary font-mono">{hex}</p>
                </div>
              ))}
            </div>

            <p className="text-body text-content-secondary mb-3">Surfaces (warm-neutral ladder):</p>
            <div className="flex gap-2 flex-wrap mb-6">
              {(
                [
                  ["Base",     "bg-surface-base",    "#0c0c0f"],
                  ["Raised",   "bg-surface-raised",  "#16161b"],
                  ["Overlay",  "bg-surface-overlay", "#1f1f26"],
                  ["Elevated", "bg-surface-elevated","#292932"],
                ] as const
              ).map(([label, bg, hex]) => (
                <div key={hex} className="text-center">
                  <div className={`w-16 h-16 rounded-card border border-stroke-default ${bg}`} />
                  <p className="text-xs text-content-secondary mt-1">{label}</p>
                  <p className="text-xs text-content-tertiary font-mono">{hex}</p>
                </div>
              ))}
            </div>

            <p className="text-body text-content-secondary mb-3">Strokes:</p>
            <div className="flex gap-4 flex-wrap mb-6">
              {(
                [
                  ["Subtle",  "#232329", "border-stroke-subtle"],
                  ["Default", "#2e2e37", "border-stroke-default"],
                  ["Strong",  "#3b3b46", "border-stroke-strong"],
                ] as const
              ).map(([label, hex, cls]) => (
                <div key={hex} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded border-2 ${cls} bg-surface-raised`} />
                  <div>
                    <p className="text-xs text-content-secondary">{label}</p>
                    <p className="text-xs text-content-tertiary font-mono">{hex}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-body text-content-secondary mb-3">Semantic accents:</p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ["Info",    "bg-accent-blue",   "#5b8cff"],
                  ["Success", "bg-accent-green",  "#34d399"],
                  ["Warning", "bg-accent-amber",  "#fbbf24"],
                  ["Error",   "bg-accent-red",    "#f87171"],
                  ["Purple",  "bg-accent-purple", "#c084fc"],
                ] as const
              ).map(([label, bg, hex]) => (
                <div key={hex} className="text-center">
                  <div className={`w-12 h-12 rounded-card ${bg}`} />
                  <p className="text-xs text-content-secondary mt-1">{label}</p>
                  <p className="text-xs text-content-tertiary font-mono">{hex}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Type scale ── */}
          <Section title="Typography Scale">
            <div className="space-y-4">
              <div>
                <p className="text-xs text-content-tertiary mb-1 uppercase tracking-widest">page-title / 1.75rem / 700 / Space Grotesk</p>
                <p className="text-page-title font-display text-content-primary">The quick brown fox</p>
              </div>
              <div>
                <p className="text-xs text-content-tertiary mb-1 uppercase tracking-widest">section-title / 1.15rem / 600 / Space Grotesk</p>
                <p className="text-section-title font-display text-content-primary">The quick brown fox jumps</p>
              </div>
              <div>
                <p className="text-xs text-content-tertiary mb-1 uppercase tracking-widest">body / 0.875rem / 400 / Inter</p>
                <p className="text-body font-sans text-content-primary">The quick brown fox jumps over the lazy dog. Sphinx of black quartz, judge my vow.</p>
              </div>
              <div>
                <p className="text-xs text-content-tertiary mb-1 uppercase tracking-widest">label / 0.75rem / 500 / Inter</p>
                <p className="text-label font-sans text-content-secondary">Field label, status filter, category</p>
              </div>
              <div>
                <p className="text-xs text-content-tertiary mb-1 uppercase tracking-widest">mono / 0.8125rem / 400 / JetBrains Mono</p>
                <p className="text-mono font-mono text-content-primary">feat/ui-redesign-pr1-foundation 6e56f0</p>
              </div>
            </div>
          </Section>

          {/* ── Shadow scale ── */}
          <Section title="Shadow Scale">
            <div className="flex gap-6 flex-wrap">
              {(
                [
                  ["sm",       "shadow-sm",       "0 1px 2px"],
                  ["card",     "shadow-card",     "2px 6px -2px / 6px 18px -6px"],
                  ["elevated", "shadow-elevated", "12px 40px -12px"],
                ] as const
              ).map(([label, cls, desc]) => (
                <div key={label} className="text-center">
                  <div className={`w-24 h-24 rounded-card bg-surface-raised ${cls} flex items-center justify-center`}>
                    <span className="text-xs text-content-tertiary font-mono">{label}</span>
                  </div>
                  <p className="text-xs text-content-tertiary mt-2 max-w-[6rem]">{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Buttons ── */}
          <Section title="Button">
            <Row label="Variants">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="ghost">Ghost</Button>
            </Row>
            <Row label="Sizes">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Row label="States">
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
              <Button href="/styleguide">As anchor</Button>
            </Row>
            <Row label="Icon buttons">
              <Button icon size="sm"><Icon name="plus" size={16} /></Button>
              <Button icon size="md" variant="secondary"><Icon name="settings" size={18} /></Button>
              <Button icon size="lg" variant="ghost"><Icon name="search" size={20} /></Button>
            </Row>
          </Section>

          {/* ── Cards ── */}
          <Section title="Card">
            <Row label="Variants">
              <Card className="w-48">
                <p className="text-sm text-content-secondary">Default card</p>
              </Card>
              <Card variant="interactive" className="w-48">
                <p className="text-sm text-content-secondary">Interactive (hover to lift)</p>
              </Card>
              <Card variant="elevated" className="w-48">
                <p className="text-sm text-content-secondary">Elevated</p>
              </Card>
            </Row>
          </Section>

          {/* ── Badges ── */}
          <Section title="Badge">
            <Row label="Variants">
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="purple">Purple</Badge>
              <Badge variant="neutral">Neutral</Badge>
            </Row>
            <Row label="With dot">
              <Badge variant="success" dot>Running</Badge>
              <Badge variant="warning" dot>In Progress</Badge>
              <Badge variant="error" dot>Failed</Badge>
              <Badge variant="info" dot>Open</Badge>
            </Row>
          </Section>

          {/* ── Inputs ── */}
          <Section title="Input / Textarea">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
              <Input label="Default input" placeholder="Placeholder text" />
              <Input label="With hint" hint="This is a helper hint" placeholder="Enter value" />
              <Input label="With error" error="This field is required" placeholder="Invalid value" />
              <Input label="Disabled" disabled placeholder="Cannot edit" />
              <div className="sm:col-span-2">
                <Textarea label="Textarea" placeholder="Enter description" rows={3} />
              </div>
              <div className="sm:col-span-2">
                <Textarea label="Textarea with error" error="Description too short" placeholder="Enter description" rows={3} />
              </div>
            </div>
          </Section>

          {/* ── Select ── */}
          <Section title="Select">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
              <Select
                label="Priority"
                options={selectOptions}
                value={selectVal}
                onChange={setSelectVal}
              />
              <Select
                label="With hint"
                hint="Choose one option"
                options={selectOptions}
                value={selectVal}
                onChange={setSelectVal}
              />
              <Select
                label="With error"
                error="Please select a priority"
                options={selectOptions}
                value=""
                onChange={setSelectVal}
                placeholder="Select priority..."
              />
              <Select
                label="Disabled"
                disabled
                options={selectOptions}
                value="medium"
                onChange={setSelectVal}
              />
            </div>
          </Section>

          {/* ── Modal ── */}
          <Section title="Modal">
            <Row label="Trigger">
              <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            </Row>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create project">
              <p className="text-body text-content-secondary mb-5">
                Modals now include a built-in close button and an optional title slot.
                Enter/scale animation respects prefers-reduced-motion.
              </p>
              <div className="space-y-4">
                <Input label="Project name" placeholder="my-project" />
                <Textarea label="Description" placeholder="What is this project for?" rows={3} />
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={() => setModalOpen(false)}>Create</Button>
              </div>
            </Modal>
          </Section>

          {/* ── Toasts ── */}
          <Section title="Toast">
            <ToastTriggers />
          </Section>

          {/* ── ErrorBanner ── */}
          <Section title="ErrorBanner">
            <div className="max-w-xl space-y-3">
              <ErrorBanner message="Failed to load projects. The API returned a 503 response." />
              <ErrorBanner
                message="Deploy pipeline failed at step: docker build."
                onRetry={() => alert("Retry clicked")}
              />
            </div>
          </Section>

          {/* ── EmptyState ── */}
          <Section title="EmptyState">
            <div className="border border-stroke-default rounded-card">
              <EmptyState
                icon={<Icon name="folder" size={48} />}
                title="No projects yet"
                description="Create your first project to start organising your work."
                actionLabel="New Project"
                onAction={() => {}}
              />
            </div>
          </Section>

          {/* ── FilterBar ── */}
          <Section title="FilterBar + PillToggleGroup">
            <FilterBar>
              <PillToggleGroup
                options={pillOptions}
                value={pillVal}
                onChange={setPillVal}
                aria-label="Filter tasks"
              />
              <Select
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                ]}
                value="newest"
                onChange={() => {}}
                className="w-40"
              />
            </FilterBar>
          </Section>

          {/* ── PageHeader ── */}
          <Section title="PageHeader">
            <div className="border border-stroke-default rounded-card p-6">
              <PageHeader
                title="Projects"
                description="All active projects in your workspace."
                actions={
                  <>
                    <Badge variant="neutral">12 total</Badge>
                    <Button size="sm"><Icon name="plus" size={14} />New Project</Button>
                  </>
                }
              />
              <p className="text-body text-content-tertiary">Page content starts here...</p>
            </div>
          </Section>

          {/* ── Icon grid ── */}
          <Section title="Icons">
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-4">
              {(
                [
                  "dashboard", "forge", "tasks", "check-circle", "rocket", "shield",
                  "settings", "logout", "chevron-left", "chevron-right", "plus",
                  "folder", "check", "x", "search", "copy", "hammer", "info",
                  "warning", "arrow-right", "external-link", "paperclip", "chat",
                ] as const
              ).map((name) => (
                <div key={name} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-10 h-10 flex items-center justify-center rounded-button bg-surface-raised border border-stroke-subtle">
                    <Icon name={name} size={18} className="text-content-secondary" />
                  </div>
                  <p className="text-[10px] text-content-tertiary leading-tight">{name}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Motion ── */}
          <Section title="Motion">
            <p className="text-body text-content-secondary mb-4">
              All animations disabled when prefers-reduced-motion is set.
            </p>
            <div className="flex gap-4 flex-wrap">
              <div className="animate-fade-in">
                <Card className="w-36 text-center">
                  <p className="text-xs text-content-secondary">fade-in</p>
                </Card>
              </div>
              <div className="animate-fade-in" style={{ "--delay": "100ms" } as React.CSSProperties}>
                <Card className="w-36 text-center">
                  <p className="text-xs text-content-secondary">delay 100ms</p>
                </Card>
              </div>
              <div className="animate-fade-in" style={{ "--delay": "200ms" } as React.CSSProperties}>
                <Card className="w-36 text-center">
                  <p className="text-xs text-content-secondary">delay 200ms</p>
                </Card>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </ToastProvider>
  );
}
