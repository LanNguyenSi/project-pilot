"use client";

import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-fast disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary";

const variants = {
  primary:   "bg-brand-500 text-white hover:bg-brand-600 rounded-button shadow-sm",
  secondary: "border border-stroke-strong text-content-primary hover:bg-surface-overlay rounded-button",
  danger:    "bg-accent-red text-white hover:bg-accent-red/90 rounded-button",
  ghost:     "text-content-secondary hover:text-content-primary hover:bg-surface-overlay rounded-button",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
} as const;

const iconSizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-10 w-10 text-sm",
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
    const cls = [base, variants[variant], icon ? iconSizes[size] : sizes[size], className]
      .filter(Boolean)
      .join(" ");

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
        aria-busy={loading || undefined}
        {...buttonRest}
      >
        {loading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="sr-only">Loading</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
