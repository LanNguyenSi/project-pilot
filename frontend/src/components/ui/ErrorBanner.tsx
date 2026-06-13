import { Button } from "./Button";
import { Icon } from "./icons";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Standardised red-tint error banner.
 *
 * Replaces 7 duplicated "border-accent-red/50 + text-accent-red" Card patterns
 * spread across pages (consolidated in PR3).
 */
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-card border border-accent-red/30 bg-accent-red/8 px-4 py-3"
    >
      <Icon name="warning" size={16} className="text-accent-red shrink-0 mt-0.5" />
      <p className="text-sm text-accent-red flex-1 leading-relaxed">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} className="shrink-0 text-accent-red hover:text-accent-red">
          Retry
        </Button>
      )}
    </div>
  );
}
