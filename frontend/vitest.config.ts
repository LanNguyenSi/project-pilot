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
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Instrument only src/lib/api.ts for this slice. The wizard component
      // (src/app/wizard/...) is deferred to a follow-up — see AC.
      include: ["src/lib/api.ts"],
      exclude: ["**/*.test.ts"],
      // Per-file threshold. Set a few points below the measured baseline so
      // a single line/branch removal (mutation) still breaks CI, while
      // normal test churn doesn't cause false failures.
      //
      // Measured baseline (2026-07-01): src/lib/api.ts is 100% statements /
      // branches / functions / lines.
      thresholds: {
        "src/lib/api.ts": {
          statements: 97,
          branches: 97,
          functions: 97,
          lines: 97,
        },
      },
    },
  },
});
