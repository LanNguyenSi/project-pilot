import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // react-hooks 7 (React Compiler rules) flags a state update that an effect
    // makes synchronously. The files below do it on purpose and cannot move to
    // render or an event handler without a behaviour change, so the rule stays
    // visible as a warning here instead of an error, and stays an error
    // everywhere else:
    //  - deploys/page.tsx, tasks/page.tsx, TaskDetailPanel.tsx: the first data
    //    load (or the reload when the selected task changes) runs from an
    //    effect and settles the loading/error state around the request.
    //  - InstallRelayWizard.tsx: wipes the credential fields and aborts the
    //    stream whenever the modal closes (a test pins the wipe).
    //  - Select.tsx: re-syncs the highlighted option each time the popover is
    //    open and the options or value change.
    files: [
      "src/app/(app)/deploys/page.tsx",
      "src/app/(app)/tasks/page.tsx",
      "src/components/TaskDetailPanel.tsx",
      "src/components/deploys/InstallRelayWizard.tsx",
      "src/components/ui/Select.tsx",
    ],
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
