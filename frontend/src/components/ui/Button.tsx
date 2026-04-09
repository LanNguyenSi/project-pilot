"use client";

import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-fast disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "bg-accent-blue text-white hover:bg-accent-blue/90 rounded-button",
  secondary: "border border-stroke-strong text-content-primary hover:bg-surface-tertiary rounded-button",
  danger: "bg-accent-red text-white hover:bg-accent-red/90 rounded-button",
  ghost: "text-content-secondary hover:text-content-primary hover:bg-surface-tertiary rounded-button",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

interface SharedProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: boolean;
}

type AsButton = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedProps> & { href?: never };

type AsAnchor = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedProps> & { href: string };

export type ButtonProps = AsButton | AsAnchor;

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", loading = false, icon = false, className = "", children, ...rest },
    ref,
  ) {
    const cls = [
      base,
      variants[variant],
      icon ? `${sizes[size].replace(/px-\d+/, "")} aspect-square` : sizes[size],
      className,
    ].join(" ");

    if ("href" in rest && typeof rest.href === "string") {
      return (
        <a ref={ref as React.Ref<HTMLAnchorElement>} className={cls} {...(rest as Omit<AsAnchor, keyof SharedProps>)}>
          {children}
        </a>
      );
    }

    const buttonRest = rest as Omit<AsButton, keyof SharedProps>;

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={cls}
        disabled={loading || buttonRest.disabled}
        {...buttonRest}
      >
        {loading ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          children
        )}
      </button>
    );
  },
);
