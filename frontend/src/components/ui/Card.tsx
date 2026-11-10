import type { HTMLAttributes, KeyboardEvent } from "react";

const base = "bg-surface-secondary border border-stroke-default rounded-card shadow-card";

const variantStyles = {
  default: "",
  interactive:
    "hover:border-stroke-strong hover:shadow-elevated motion-safe:hover:-translate-y-px cursor-pointer transition-all duration-fast motion-reduce:transition-none",
  elevated:
    "shadow-elevated",
} as const;

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof variantStyles;
  noPadding?: boolean;
}

export function Card({
  variant = "default",
  noPadding = false,
  className = "",
  children,
  onClick,
  onKeyDown,
  ...rest
}: CardProps) {
  // A Card with an onClick is a button for keyboard and assistive technology
  // users; without one it stays a plain div (no role, not focusable).
  const interactiveProps = onClick
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          onKeyDown?.(e);
          // Only the card itself, never a control nested inside it.
          if (e.defaultPrevented || e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            // Space would otherwise scroll the page.
            e.preventDefault();
            e.currentTarget.click();
          }
        },
      }
    : { onKeyDown };
  const focusRing = onClick
    ? " focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/60"
    : "";
  return (
    <div
      className={`${base} ${variantStyles[variant]} ${noPadding ? "" : "p-4"} ${className}${focusRing}`}
      {...rest}
      {...interactiveProps}
    >
      {children}
    </div>
  );
}
