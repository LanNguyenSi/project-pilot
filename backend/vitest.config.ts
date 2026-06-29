import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests live in tests/ and as sibling *.test.ts in src/routes/
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Instrument all source files; exclude the server entrypoint (no
      // testable logic) and test files themselves.
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "**/*.test.ts"],
      // Per-file thresholds for the four HIGH-gap files we added tests for.
      // Thresholds are set a few points below the measured baseline so a
      // single line removal (mutation) still breaks CI, while normal test
      // churn doesn't cause false failures.
      //
      // Measured baseline (2026-06-29):
      //   middleware/csrf.ts          → 100% stmts / 100% branch / 100% funcs
      //   routes/credentials.ts       → 95.3% stmts / 100% branch / 71.4% funcs / 95.3% lines
      //   services/credentials.ts     → 100% stmts / 100% branch / 100% funcs
      //   routes/tasks.ts             → 67.8% stmts / 37.5% branch / 66.7% funcs / 76.9% lines
      //
      // Global threshold is intentionally absent: the other 73 backend files
      // are not yet covered and would push the aggregate near 0.
      thresholds: {
        "src/middleware/csrf.ts": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        "src/routes/credentials.ts": {
          statements: 90,
          branches: 95,
          functions: 65,
          lines: 90,
        },
        "src/services/credentials.ts": {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        "src/routes/tasks.ts": {
          statements: 63,
          branches: 32,
          functions: 62,
          lines: 72,
        },
      },
    },
  },
});
