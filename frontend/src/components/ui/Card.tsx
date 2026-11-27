import type { HTMLAttributes, KeyboardEvent } from "react";

// Cards whose Space keydown started on the card itself. Module scope instead of
// a hook: Card is also rendered from server components, where hooks are not allowed.
const spaceStarted = new WeakSet<EventTarget>();

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
  onKeyUp,
  ...rest
}: CardProps) {
  // Space activates on keyup like a native button, and only when its keydown
  // also happened on this card (focus moved onto it mid-press must not click).
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
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.click();
          } else if (e.key === " ") {
            // Space would otherwise scroll the page; activation waits for keyup.
            e.preventDefault();
            spaceStarted.add(e.currentTarget);
          }
        },
        onKeyUp: (e: KeyboardEvent<HTMLDivElement>) => {
          onKeyUp?.(e);
          if (e.key !== " " || e.target !== e.currentTarget) return;
          const started = spaceStarted.delete(e.currentTarget);
          if (started && !e.defaultPrevented) e.currentTarget.click();
        },
      }
    : { onKeyDown, onKeyUp };
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
