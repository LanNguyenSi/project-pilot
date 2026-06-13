"use client";

import { useEffect, useCallback, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus inside `containerRef` and closes on Escape.
 *
 * Extracted from Modal.tsx and TaskDetailPanel.tsx (both had identical logic).
 * Modal now imports this hook; TaskDetailPanel keeps its inline copy for PR1
 * to avoid scope creep - PR3 can migrate it.
 *
 * @param containerRef  Ref to the panel/dialog element
 * @param active        Whether the trap is active (open state)
 * @param onClose       Called when Escape is pressed
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onCloseRef.current();
      return;
    }
    if (e.key === "Tab" && containerRef.current) {
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [containerRef]);

  useEffect(() => {
    if (!active) return;
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    // Focus first focusable element
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      el?.focus();
    });
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [active, handleKey, containerRef]);
}
