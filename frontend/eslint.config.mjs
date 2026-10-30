import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // react-hooks 7 (React Compiler rules) flags a call to an async fetcher from
    // an effect when the fetcher sets state, even though it only does so after an
    // await. The two pages below load their first data that way, and the fetchers
    // are shared with event handlers, so the rule is a warning here and stays an
    // error everywhere else.
    files: ["src/app/(app)/deploys/page.tsx", "src/app/(app)/tasks/page.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      ".claude/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
]);
