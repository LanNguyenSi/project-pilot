"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select...",
  label,
  hint,
  error,
  disabled = false,
  className = "",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const listboxId = `${id}-listbox`;
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;
  const hasDesc = !!(error || hint);

  const selected = options.find((o) => o.value === value);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      setActiveIndex(options.findIndex((o) => o.value === value));
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside, options, value]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i < options.length - 1 ? i + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : options.length - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < options.length) {
          onChange(options[activeIndex].value);
          setOpen(false);
        }
        break;
    }
  }

  // Scroll active option into view
  useEffect(() => {
    if (open && activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  const triggerCls = [
    "w-full flex items-center justify-between bg-surface-overlay border rounded-input px-3 h-9 text-sm transition-colors duration-fast",
    "focus:outline-none focus-visible:ring-2",
    error
      ? "border-accent-red focus-visible:ring-accent-red/50 focus-visible:border-accent-red"
      : "border-stroke-strong focus-visible:ring-brand-500/60 focus-visible:border-brand-500",
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    selected ? "text-content-primary" : "text-content-tertiary",
  ].join(" ");

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <span id={labelId} className="block text-label text-content-secondary mb-1">{label}</span>
      )}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={hasDesc ? descId : undefined}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(!open); }}
        onKeyDown={handleKeyDown}
        className={triggerCls}
      >
        <span className="flex-1 min-w-0 truncate text-left">{selected ? selected.label : placeholder}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform duration-fast ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {error && <p id={descId} className="text-accent-red text-xs mt-1">{error}</p>}
      {!error && hint && <p id={descId} className="text-content-tertiary text-xs mt-1">{hint}</p>}

      {open && !disabled && (
        <div
          ref={listRef}
          role="listbox"
          id={listboxId}
          aria-labelledby={label ? labelId : undefined}
          className="absolute z-50 top-full mt-1 w-full bg-surface-elevated border border-stroke-strong rounded-card shadow-elevated py-1 max-h-60 overflow-auto animate-fade-in"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-content-tertiary">No options</div>
          ) : (
            options.map((opt, i) => (
              <div
                key={opt.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`px-3 py-2 text-sm rounded-button mx-1 cursor-pointer flex items-center gap-2 transition-colors duration-fast ${
                  i === activeIndex ? "bg-surface-overlay" : ""
                } ${opt.value === value ? "text-brand-300" : "text-content-primary"}`}
              >
                {opt.value === value ? (
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
