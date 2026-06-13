/**
 * Security page - embeds depsight's native UI inside project-pilot's shell.
 *
 * Why an iframe rather than re-rendering: depsight owns its CVE / license /
 * dependency dashboards as single source of truth. project-pilot adds value
 * only by wrapping it in a unified nav shell and later by aggregating
 * cross-module summary data.
 *
 * Auth caveat: depsight uses NextAuth + GitHub OAuth. The first time a user
 * visits this page without a depsight session, the iframe loads depsight's
 * login page - but clicking "Sign in with GitHub" there fails because
 * github.com returns `X-Frame-Options: DENY`, which refuses to render in any
 * iframe. Workaround: direct the user to open depsight in a new tab for the
 * one-time OAuth dance; every subsequent visit loads the dashboard directly.
 */

import { PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui";

const DEPSIGHT_URL =
  process.env.NEXT_PUBLIC_DEPSIGHT_URL ?? "https://depsight.opentriologue.ai";

export default function SecurityPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.topbar))]">
      {/* Page header - inside the height-constrained wrapper; compact so iframe keeps most of the space */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <PageHeader
          title="Security"
          description="Dependency and vulnerability scanning via depsight."
          actions={
            <a
              href={DEPSIGHT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-200 transition-colors"
              title="Open depsight in a new tab"
            >
              Open full-screen
              <Icon name="external-link" size={14} />
            </a>
          }
        />
      </div>

      {/* Info banner row */}
      <div className="px-6 py-2.5 border-t border-b border-stroke-default bg-surface-raised text-xs text-content-tertiary flex items-center justify-between gap-4 shrink-0">
        <span>
          Embedded depsight.{" "}
          <span className="text-content-secondary">First visit?</span>{" "}
          Open{" "}
          <a
            href={DEPSIGHT_URL}
            target="_blank"
            rel="noreferrer"
            className="text-brand-300 hover:text-brand-200 hover:underline"
          >
            depsight in a new tab
          </a>{" "}
          once to sign in with GitHub - GitHub refuses iframe auth.
          {" "}If the panel below is blank, depsight may be unreachable; use the link above to check.
        </span>
      </div>

      <iframe
        src={DEPSIGHT_URL}
        title="depsight"
        className="flex-1 w-full border-0 min-h-0"
        // Minimum set of permissions: scripts + same-origin for depsight's
        // NextAuth session, forms for login submission, popups for any
        // external links depsight itself renders.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
