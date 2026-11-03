"use client";

import { useEffect, useLayoutEffect, useCallback, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Focusable descendants that are actually rendered.
 *
 * An element in a `display: none` subtree has no client rects and cannot be
 * focused, so keeping it in the list makes the trap wrap to a control that
 * swallows the focus: `last.focus()` on a hidden last element leaves the focus
 * where it was and Tab stops cycling.
 *
 * jsdom has no layout engine, so it reports no client rects for *anything*
 * (a plain button included). That signal is meaningless rather than "hidden",
 * so an entirely rect-less document falls back to the unfiltered list; real
 * browsers lay out, filter, and stay on the filtered path.
 */
function getFocusable(container: HTMLElement): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const rendered = all.filter((el) => el.getClientRects().length > 0);
  return rendered.length > 0 ? rendered : all;
}

/**
 * Traps Tab focus inside `containerRef` and closes on Escape.
 *
 * Extracted from Modal.tsx and TaskDetailPanel.tsx (both had identical logic).
 * Both now import this hook.
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
  // Keep the latest onClose without re-subscribing the keydown listener.
  // A layout effect runs in the commit, before the browser can dispatch a key event.
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onCloseRef.current();
      return;
    }
    if (e.key === "Tab" && containerRef.current) {
      const focusable = getFocusable(containerRef.current);
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
    // Focus first focusable element (skipping hidden ones, same list as Tab)
    requestAnimationFrame(() => {
      const el = containerRef.current ? getFocusable(containerRef.current)[0] : undefined;
      el?.focus();
    });
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [active, handleKey, containerRef]);
}
