import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // The repo's tsconfig.json sets "jsx": "preserve" (Next.js compiles JSX via
  // its own SWC pipeline). Vite (rolldown/oxc in this vite version) reads
  // that same tsconfig's jsx setting and inherits "preserve", which its own
  // transform can't parse. Force the automatic runtime here so *.tsx
  // component tests transform correctly. Scoped to the test runner only —
  // does not affect the Next.js build.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    // Node 26 ships experimental Web Storage globals (localStorage /
    // sessionStorage) that collide with jsdom's own implementations and
    // break DOM-heavy tests. --no-experimental-webstorage turns those globals
    // back off. Node 20 doesn't know this flag at all, so the guard is
    // load-bearing: an unconditional execArgv entry would break the Node 20
    // lane outright rather than just being a no-op there.
    execArgv: process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")
      ? ["--no-experimental-webstorage"]
      : [],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      // Instrumented files, one entry per slice. Component tests
      // (*.test.tsx) opt into jsdom per-file via a `// @vitest-environment
      // jsdom` docblock; everything else stays on vitest's default node
      // environment.
      include: ["src/lib/api.ts", "src/components/deploys/InstallRelayWizard.tsx"],
      // Per-file threshold. This gate catches the test file being deleted
      // outright, or a large chunk of new code landing with no coverage at
      // all — it does NOT reliably catch single-line/branch mutations;
      // those are caught by the tests' own assertions, not by the coverage
      // percentage. (The previous version of this comment claimed the
      // opposite — that thresholds alone would catch a line/branch removal —
      // which measured false in both directions: removing the wipe-effect
      // line or the handleClose abort call barely moved these numbers, and
      // it was the assertions, not the thresholds, that turned the mutants
      // red.)
      //
      // Measured baseline (2026-07-01): src/lib/api.ts is 100% statements /
      // branches / functions / lines.
      // Measured baseline (2026-08-17): InstallRelayWizard.tsx is 60.70%
      // statements, 55.38% branches, 55.88% functions, 64.67% lines (the
      // component test covers the probe + SSE-install-stream state machine;
      // the sub-forms for the other wizard steps, e.g. private-key auth
      // inputs, are not exercised yet).
      thresholds: {
        "src/lib/api.ts": {
          statements: 97,
          branches: 97,
          functions: 97,
          lines: 97,
        },
        "src/components/deploys/InstallRelayWizard.tsx": {
          statements: 58,
          branches: 52,
          functions: 45,
          lines: 62,
        },
      },
    },
  },
});
