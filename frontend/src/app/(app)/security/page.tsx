"use client";

/**
 * Security page — embeds depsight's native UI inside project-pilot's shell.
 *
 * Why an iframe rather than re-rendering: depsight owns its CVE / license /
 * dependency dashboards as single source of truth. project-pilot adds value
 * only by wrapping it in a unified nav shell and later by aggregating
 * cross-module summary data.
 *
 * Auth caveat: depsight uses NextAuth + GitHub OAuth. The first time a user
 * visits this page without a depsight session, the iframe loads depsight's
 * login page — but clicking "Sign in with GitHub" there fails because
 * github.com returns `X-Frame-Options: DENY`, which refuses to render in any
 * iframe. Workaround: direct the user to open depsight in a new tab for the
 * one-time OAuth dance; every subsequent visit loads the dashboard directly.
 */

const DEPSIGHT_URL =
  process.env.NEXT_PUBLIC_DEPSIGHT_URL ?? "https://depsight.opentriologue.ai";

export default function SecurityPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.topbar))]">
      <div className="px-6 py-3 border-b border-stroke-default bg-surface-secondary text-xs text-content-tertiary flex items-center justify-between">
        <span>
          Embedded depsight.{" "}
          <span className="text-content-secondary">
            First visit?
          </span>{" "}
          Open{" "}
          <a
            href={DEPSIGHT_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent-blue hover:underline"
          >
            depsight in a new tab
          </a>{" "}
          once to sign in with GitHub — GitHub refuses iframe auth.
        </span>
        <a
          href={DEPSIGHT_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent-blue hover:underline"
          title="Open depsight full-screen in a new tab"
        >
          Open ↗
        </a>
      </div>
      <iframe
        src={DEPSIGHT_URL}
        title="depsight"
        className="flex-1 w-full border-0"
        // Minimum set of permissions: scripts + same-origin for depsight's
        // NextAuth session, forms for login submission, popups for any
        // external links depsight itself renders.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
