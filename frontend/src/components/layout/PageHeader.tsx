import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned slot for action buttons, badge counts, etc. */
  actions?: ReactNode;
}

/**
 * Consistent page-level header.
 *
 * Renders a real <h1> at `text-page-title` (1.75rem / 700 / Space Grotesk)
 * with an optional description line and an actions slot on the right.
 * Below the `sm` breakpoint the actions stack under the title (the same pattern
 * as the task list toolbar) instead of competing with it for one row, which is
 * how the Deploys page's two buttons used to overlap the <h1> at 390 px.
 * The bottom margin is standardised so pages stop using ad-hoc mb-4/6/8.
 *
 * Adopted across pages in PR2.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-page-title font-display text-content-primary tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-body text-content-secondary mt-1.5 max-w-xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
