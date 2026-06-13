/**
 * Design tokens for project-pilot - Refined Dark v1.
 *
 * Single source of truth consumed by tailwind.config.ts and globals.css.
 * Tailwind classes use CSS variables so values can be changed at runtime.
 *
 * Surface naming note:
 *   Legacy names (primary/secondary/tertiary/elevated) are preserved as CSS
 *   vars and Tailwind classes so all existing call sites keep compiling.
 *   They map onto the new semantic ladder: base/raised/overlay/elevated.
 *
 * Brand:
 *   Custom violet-indigo (#6e56f0 at 500) - the primary action color.
 *   Separated from the semantic "info" blue (#5b8cff).
 */

// ── Brand (custom violet-indigo) ─────────────────────────────────────────────

export const brand = {
  50:  "var(--brand-50)",
  300: "var(--brand-300)",
  400: "var(--brand-400)",
  500: "var(--brand-500)",
  600: "var(--brand-600)",
  700: "var(--brand-700)",
} as const;

export const rawBrand = {
  50:  "#ece9ff",
  300: "#b3a6ff",
  400: "#9a86ff",
  500: "#6e56f0",
  600: "#5b43d6",
  700: "#4a35b0",
} as const;

// ── Colors ───────────────────────────────────────────────────────────────────

export const colors = {
  brand,
  surface: {
    // Legacy names - kept for backward compat, values remapped to new ladder
    primary:   "var(--surface-primary)",   // = base   #0c0c0f
    secondary: "var(--surface-secondary)", // = raised  #16161b
    tertiary:  "var(--surface-tertiary)",  // = overlay #1f1f26
    elevated:  "var(--surface-elevated)",  // = elevated #292932
    // New semantic aliases
    base:    "var(--surface-base)",
    raised:  "var(--surface-raised)",
    overlay: "var(--surface-overlay)",
  },
  stroke: {
    subtle:  "var(--stroke-subtle)",
    default: "var(--stroke-default)",
    strong:  "var(--stroke-strong)",
  },
  content: {
    primary:   "var(--content-primary)",
    secondary: "var(--content-secondary)",
    tertiary:  "var(--content-tertiary)",
  },
  accent: {
    blue:   "var(--accent-blue)",
    green:  "var(--accent-green)",
    amber:  "var(--accent-amber)",
    red:    "var(--accent-red)",
    purple: "var(--accent-purple)",
  },
} as const;

/** Raw hex values used in globals.css CSS custom property definitions. */
export const rawColors = {
  surface: {
    base:    "#0c0c0f",
    raised:  "#16161b",
    overlay: "#1f1f26",
    elevated: "#292932",
    // Legacy aliases
    primary:   "#0c0c0f",
    secondary: "#16161b",
    tertiary:  "#1f1f26",
  },
  stroke: {
    subtle:  "#232329",
    default: "#2e2e37",
    strong:  "#3b3b46",
  },
  content: {
    primary:   "#f2f2f5",
    secondary: "#a8a8b3",
    tertiary:  "#71717f",
  },
  accent: {
    blue:   "#5b8cff",
    green:  "#34d399",
    amber:  "#fbbf24",
    red:    "#f87171",
    purple: "#c084fc",
  },
} as const;

// ── Typography ───────────────────────────────────────────────────────────────

export const fontSize = {
  "page-title":    ["1.75rem",   { lineHeight: "2.25rem", fontWeight: "700", letterSpacing: "-0.02em" }],
  "section-title": ["1.15rem",   { lineHeight: "1.75rem", fontWeight: "600" }],
  body:            ["0.875rem",  { lineHeight: "1.375rem", fontWeight: "400" }],
  label:           ["0.75rem",   { lineHeight: "1rem",    fontWeight: "500", letterSpacing: "0.02em" }],
  mono:            ["0.8125rem", { lineHeight: "1.25rem", fontWeight: "400" }],
} satisfies Record<string, [string, Record<string, string>]>;

// ── Spacing (extending Tailwind's default 4px scale) ────────────────────────

export const spacing = {
  "4.5": "1.125rem",
  "13":  "3.25rem",
  "15":  "3.75rem",
  "18":  "4.5rem",
  sidebar:            "15rem",
  "sidebar-collapsed": "4rem",
  topbar:             "3rem",
} as const;

// ── Border radius ────────────────────────────────────────────────────────────

export const borderRadius = {
  card:   "14px",
  button: "10px",
  input:  "10px",
  badge:  "9999px",
} as const;

// ── Shadow scale ─────────────────────────────────────────────────────────────

export const boxShadow = {
  sm:       "0 1px 2px rgba(0,0,0,.35)",
  card:     "0 2px 6px -2px rgba(0,0,0,.45), 0 6px 18px -6px rgba(0,0,0,.35)",
  elevated: "0 12px 40px -12px rgba(0,0,0,.6)",
  focus:    "0 0 0 3px rgba(110,86,240,.22)",
} as const;

// ── Transitions ──────────────────────────────────────────────────────────────

export const transitionDuration = {
  fast:   "100ms",
  normal: "200ms",
  slow:   "300ms",
} as const;
