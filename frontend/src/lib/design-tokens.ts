/**
 * Design tokens for project-pilot.
 *
 * Single source of truth consumed by tailwind.config.ts (as raw values)
 * and importable by components that need programmatic access.
 */

// ── Colors ──────────────────────────────────────────────────────────────────

export const colors = {
  bg: {
    primary: "#0a0a0a",
    secondary: "#111827",
    tertiary: "#1f2937",
    elevated: "#374151",
  },
  border: {
    default: "#1f2937",
    strong: "#374151",
  },
  text: {
    primary: "#ededed",
    secondary: "#9ca3af",
    tertiary: "#6b7280",
  },
  accent: {
    blue: "#3b82f6",
    green: "#22c55e",
    amber: "#f59e0b",
    red: "#ef4444",
    purple: "#a855f7",
  },
} as const;

// ── Typography ──────────────────────────────────────────────────────────────

export const fontSize = {
  "page-title": ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
  "section-title": ["1.125rem", { lineHeight: "1.75rem", fontWeight: "600" }],
  body: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }],
  label: ["0.75rem", { lineHeight: "1rem", fontWeight: "500", letterSpacing: "0.025em" }],
  mono: ["0.8125rem", { lineHeight: "1.25rem", fontWeight: "400" }],
} as const;

// ── Spacing (extending Tailwind's default 4px scale) ────────────────────────

export const spacing = {
  "4.5": "1.125rem", // 18px
  "13": "3.25rem",   // 52px
  "15": "3.75rem",   // 60px
  "18": "4.5rem",    // 72px
  sidebar: "15rem",        // 240px
  "sidebar-collapsed": "4rem", // 64px
  topbar: "3rem",          // 48px
} as const;

// ── Border radius ───────────────────────────────────────────────────────────

export const borderRadius = {
  sm: "6px",
  md: "8px",
  lg: "12px",
} as const;

// ── Transitions ─────────────────────────────────────────────────────────────

export const transitionDuration = {
  fast: "100ms",
  normal: "200ms",
  slow: "300ms",
} as const;
