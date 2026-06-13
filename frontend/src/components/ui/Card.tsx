import type { HTMLAttributes } from "react";

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
  ...rest
}: CardProps) {
  return (
    <div
      className={`${base} ${variantStyles[variant]} ${noPadding ? "" : "p-4"} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
