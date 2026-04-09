import type { HTMLAttributes } from "react";

const base = "bg-surface-secondary border border-stroke-default rounded-card";

const variantStyles = {
  default: "",
  interactive:
    "hover:border-stroke-strong hover:bg-surface-tertiary/50 cursor-pointer transition-colors duration-fast",
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
