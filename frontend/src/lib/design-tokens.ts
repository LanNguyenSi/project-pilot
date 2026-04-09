/**
 * Design tokens for project-pilot.
 *
 * Single source of truth consumed by tailwind.config.ts and globals.css.
 * Tailwind classes use CSS variables so values can be changed at runtime.
 */

// ── Colors ──────────────────────────────────────────────────────────────────

export const colors = {
  surface: {
    primary: "var(--surface-primary)",
    secondary: "var(--surface-secondary)",
    tertiary: "var(--surface-tertiary)",
    elevated: "var(--surface-elevated)",
  },
  stroke: {
    default: "var(--stroke-default)",
    strong: "var(--stroke-strong)",
  },
  content: {
    primary: "var(--content-primary)",
    secondary: "var(--content-secondary)",
    tertiary: "var(--content-tertiary)",
  },
  accent: {
    blue: "var(--accent-blue)",
    green: "var(--accent-green)",
    amber: "var(--accent-amber)",
    red: "var(--accent-red)",
    purple: "var(--accent-purple)",
  },
} as const;

/** Raw hex values — used in globals.css as CSS custom property definitions. */
export const rawColors = {
  surface: {
    primary: "#0a0a0a",
    secondary: "#111827",
    tertiary: "#1f2937",
    elevated: "#374151",
  },
  stroke: {
    default: "#1f2937",
    strong: "#374151",
  },
  content: {
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
} satisfies Record<string, [string, Record<string, string>]>;

// ── Spacing (extending Tailwind's default 4px scale) ────────────────────────

export const spacing = {
  "4.5": "1.125rem",
  "13": "3.25rem",
  "15": "3.75rem",
  "18": "4.5rem",
  sidebar: "15rem",
  "sidebar-collapsed": "4rem",
  topbar: "3rem",
} as const;

// ── Border radius (custom keys to avoid overriding Tailwind sm/md/lg) ───────

export const borderRadius = {
  card: "12px",
  button: "8px",
  input: "8px",
  badge: "9999px",
} as const;

// ── Transitions ─────────────────────────────────────────────────────────────

export const transitionDuration = {
  fast: "100ms",
  normal: "200ms",
  slow: "300ms",
} as const;
