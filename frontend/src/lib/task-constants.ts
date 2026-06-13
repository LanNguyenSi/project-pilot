/**
 * Shared task status and priority maps.
 *
 * Extracted from the duplicate definitions in:
 *   - app/(app)/tasks/[projectId]/page.tsx
 *   - components/TaskDetailPanel.tsx
 *
 * PR3 migrates both call sites to import from here.
 * For PR1/PR2 the existing pages keep their inline copies to avoid scope creep.
 */

import type { BadgeVariant } from "@/components/ui/Badge";

export const statusMap: Record<string, { label: string; variant: BadgeVariant }> = {
  open:        { label: "Open",        variant: "info" },
  in_progress: { label: "In Progress", variant: "warning" },
  review:      { label: "Review",      variant: "purple" },
  done:        { label: "Done",        variant: "success" },
};

export const priorityMap: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "Critical", color: "text-accent-red" },
  HIGH:     { label: "High",     color: "text-accent-amber" },
  MEDIUM:   { label: "Medium",   color: "text-accent-blue" },
  LOW:      { label: "Low",      color: "text-content-tertiary" },
};

/** Tailwind class for the priority colour bar (full literals for JIT). */
// bg-accent-red bg-accent-amber bg-accent-blue bg-surface-overlay
export const priorityBar: Record<string, string> = {
  CRITICAL: "bg-accent-red",
  HIGH:     "bg-accent-amber",
  MEDIUM:   "bg-accent-blue",
  LOW:      "bg-surface-overlay",
};

export const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH:     1,
  MEDIUM:   2,
  LOW:      3,
};
