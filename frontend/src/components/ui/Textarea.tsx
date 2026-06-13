"use client";

import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const textareaBase =
  "w-full bg-surface-overlay border rounded-input px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus-visible:ring-2 resize-none transition-colors duration-fast";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, error, className = "", id, ...rest }, ref) {
    const autoId = useId();
    const textareaId = id || autoId;
    const descId = `${textareaId}-desc`;
    const hasDesc = !!(error || hint);
    const borderCls = error
      ? "border-accent-red focus-visible:ring-accent-red/50 focus-visible:border-accent-red"
      : "border-stroke-strong focus-visible:ring-brand-500/60 focus-visible:border-brand-500";

    return (
      <div>
        {label && (
          <label htmlFor={textareaId} className="block text-label text-content-secondary mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`${textareaBase} ${borderCls} ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasDesc ? descId : undefined}
          {...rest}
        />
        {error && <p id={descId} className="text-accent-red text-xs mt-1">{error}</p>}
        {!error && hint && <p id={descId} className="text-content-tertiary text-xs mt-1">{hint}</p>}
      </div>
    );
  },
);
