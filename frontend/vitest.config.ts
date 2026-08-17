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
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      // Instrumented files, one entry per slice. Component tests
      // (*.test.tsx) opt into jsdom per-file via a `// @vitest-environment
      // jsdom` docblock; everything else stays on vitest's default node
      // environment.
      include: ["src/lib/api.ts", "src/components/deploys/InstallRelayWizard.tsx"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
      // Per-file threshold. Set a few points below the measured baseline so
      // a single line/branch removal (mutation) still breaks CI, while
      // normal test churn doesn't cause false failures.
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
          functions: 53,
          lines: 62,
        },
      },
    },
  },
});
