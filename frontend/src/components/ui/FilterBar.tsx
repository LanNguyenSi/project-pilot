"use client";

import type { ReactNode } from "react";

// ── PillToggleGroup ──────────────────────────────────────────────────────────

interface PillOption<T extends string> {
  key: T;
  label: string;
  count?: number;
}

interface PillToggleGroupProps<T extends string> {
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
}

/**
 * Row of pill buttons for mutually exclusive filter selection.
 *
 * The active pill uses brand tinting (consistent with the design-system CTA).
 * Already used in tasks/[projectId] - extracted here as a reusable primitive.
 * PR3 adopts it via FilterBar.
 */
export function PillToggleGroup<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: PillToggleGroupProps<T>) {
  return (
    <div className="flex gap-1" role="toolbar" aria-label={ariaLabel ?? "Filter options"}>
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          aria-pressed={value === opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-button transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
            value === opt.key
              ? "bg-brand-500/10 text-brand-300"
              : "text-content-tertiary hover:text-content-primary hover:bg-surface-overlay"
          }`}
        >
          {opt.label}
          {opt.count != null && (
            <span className="ml-1.5 tabular-nums text-content-tertiary">{opt.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── FilterBar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Horizontal container for a PillToggleGroup + optional Select elements.
 *
 * Usage:
 *   <FilterBar>
 *     <PillToggleGroup ... />
 *     <Select ... />
 *   </FilterBar>
 *
 * Adopted across feature pages in PR3.
 */
export function FilterBar({ children, className = "" }: FilterBarProps) {
  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`}>
      {children}
    </div>
  );
}
