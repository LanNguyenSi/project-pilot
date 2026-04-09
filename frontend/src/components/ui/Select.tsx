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
  className?: string;
}

export function Select({ options, value, onChange, placeholder = "Select...", label, className = "" }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const listboxId = `${id}-listbox`;
  const labelId = `${id}-label`;

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

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <span id={labelId} className="block text-label text-content-tertiary mb-1">{label}</span>
      )}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between bg-surface-primary border border-stroke-strong rounded-input px-3 h-9 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue transition-colors duration-fast"
      >
        <span className={selected ? "" : "text-content-tertiary"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-content-tertiary transition-transform duration-fast ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          id={listboxId}
          aria-labelledby={label ? labelId : undefined}
          className="absolute z-50 top-full mt-1 w-full bg-surface-elevated border border-stroke-strong rounded-lg shadow-xl py-1 max-h-60 overflow-auto"
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
                  i === activeIndex ? "bg-surface-tertiary" : ""
                } ${opt.value === value ? "text-accent-blue" : "text-content-primary"}`}
              >
                {opt.value === value ? (
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
