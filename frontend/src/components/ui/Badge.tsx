const variantStyles = {
  success: "bg-accent-green/15 text-accent-green",
  warning: "bg-accent-amber/15 text-accent-amber",
  error: "bg-accent-red/15 text-accent-red",
  info: "bg-accent-blue/15 text-accent-blue",
  purple: "bg-accent-purple/15 text-accent-purple",
  neutral: "bg-surface-tertiary text-content-secondary",
} as const;

export type BadgeVariant = keyof typeof variantStyles;

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", dot = false, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
