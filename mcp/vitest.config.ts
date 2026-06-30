import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Instrument only client.ts and tools.ts — do NOT include index.ts
      // (self-running entrypoint) or config.ts (process.exit env reader),
      // mirroring the backend pattern that excludes src/server.ts.
      include: ["src/client.ts", "src/tools.ts"],
      exclude: ["**/*.test.ts"],
      // Per-file thresholds. Set ~3 points below the measured baseline so a
      // single line removal (mutation) still breaks CI, while normal test
      // churn doesn't cause false failures.
      //
      // Measured baseline (2026-06-30):
      //   src/client.ts  → 100% stmts / 100% branch / 100% funcs / 100% lines
      //   src/tools.ts   → 98.7% stmts / 90% branch / 100% funcs / 98.33% lines
      //
      // tools.ts branch coverage is 90% because line 260 (the outer catch of
      // dashboard_summary) is structurally unreachable: Promise.allSettled
      // never throws, so the outer try/catch path cannot be triggered.
      // The threshold is set ~3 points below 90% to accept this known gap
      // without silently allowing real regressions.
      thresholds: {
        "src/client.ts": {
          statements: 97,
          branches: 97,
          functions: 97,
          lines: 97,
        },
        "src/tools.ts": {
          statements: 95,
          branches: 87,
          functions: 97,
          lines: 95,
        },
      },
    },
  },
});
