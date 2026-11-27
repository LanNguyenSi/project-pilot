import type { ReactNode } from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  /** Heading level of the title. Use 2 directly under a page h1; defaults to 3. */
  headingLevel?: 2 | 3;
}

export function EmptyState({ icon, title, description, actionLabel, actionHref, onAction, headingLevel = 3 }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-content-tertiary mb-5 opacity-60">{icon}</div>
      <Heading className="text-base font-semibold font-display text-content-primary">{title}</Heading>
      {description && (
        <p className="text-sm text-content-secondary mt-2 max-w-xs leading-relaxed">{description}</p>
      )}
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-6">
          {actionHref ? (
            <Button href={actionHref}>{actionLabel}</Button>
          ) : (
            <Button onClick={onAction}>{actionLabel}</Button>
          )}
        </div>
      )}
    </div>
  );
}
