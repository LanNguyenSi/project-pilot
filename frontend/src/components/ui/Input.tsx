"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const inputBase =
  "w-full bg-surface-primary border rounded-input px-3 h-9 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 transition-colors duration-fast";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, hint, error, className = "", id, ...rest }, ref) {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const borderCls = error
      ? "border-accent-red focus:ring-accent-red/50 focus:border-accent-red"
      : "border-stroke-strong focus:ring-accent-blue/50 focus:border-accent-blue";

    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-label text-content-tertiary mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${inputBase} ${borderCls} ${className}`}
          {...rest}
        />
        {error && <p className="text-accent-red text-xs mt-1">{error}</p>}
        {!error && hint && <p className="text-content-tertiary text-xs mt-1">{hint}</p>}
      </div>
    );
  },
);
