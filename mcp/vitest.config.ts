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
      // single line/branch removal (mutation) still breaks CI, while normal
      // test churn doesn't cause false failures.
      //
      // Measured baseline (2026-06-30): src/client.ts and src/tools.ts are
      // both 100% statements / branches / functions / lines.
      thresholds: {
        "src/client.ts": {
          statements: 97,
          branches: 97,
          functions: 97,
          lines: 97,
        },
        "src/tools.ts": {
          statements: 97,
          branches: 97,
          functions: 97,
          lines: 97,
        },
      },
    },
  },
});
