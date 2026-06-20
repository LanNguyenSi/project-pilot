"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { useFocusTrap } from "./useFocusTrap";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional title rendered as an accessible heading inside the dialog. */
  title?: string;
  /**
   * Show the built-in close button. Defaults to true when `title` is set and
   * false otherwise, so un-migrated modals that still hand-roll their own close
   * button do not render a duplicate. PR3 migrates those to pass `title`.
   */
  showClose?: boolean;
  /**
   * Controls the max-width of the modal panel.
   * 'md' (default) → max-w-md (existing behaviour, no visual change for current callers).
   * 'lg' → max-w-lg for wider content such as multi-step wizards.
   */
  size?: "md" | "lg";
}

export function Modal({ open, onClose, children, title, showClose, size = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeVisible = showClose ?? title != null;

  // Only portal after mount so the server render and the first client render agree
  // (both null). This avoids a hydration mismatch for a modal open on first paint
  // and, critically, prevents touching document.body during SSR / static prerender
  // where `document` is undefined.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Gate the focus trap on `mounted` too, so it only activates once the panel
  // actually exists (a conditionally-mounted `<Modal open .../>` would otherwise try
  // to trap focus one tick before the panel renders). No-op for always-mounted
  // consumers, where `mounted` is already true before `open` flips.
  useFocusTrap(panelRef, open && mounted, onClose);

  // Render into document.body so the dialog's `fixed` positioning is relative to
  // the viewport, not to an ancestor that establishes a containing block. AppShell's
  // <main> keeps a persistent `transform` from `animate-fade-in` (fill-mode: both),
  // which would otherwise scope this fixed overlay to <main>'s box and clip a tall
  // modal (only the centered slice is visible).
  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      {/* Backdrop: fixed so it always covers the viewport while the dialog scrolls. */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-modal-backdrop"
        onClick={onClose}
      />

      {/* Scroll + centering layer. The OUTER dialog scrolls, not the panel, so a tall
          modal can never clip its title/top fields off-screen AND the panel keeps
          overflow visible (popovers like the Select dropdown are not clipped).
          pointer-events-none lets a click on the gutter fall through to the backdrop
          (close on outside click); the panel re-enables pointer events. */}
      <div className="flex min-h-full items-center justify-center p-4 pointer-events-none">
        {/* Panel */}
        <div
          ref={panelRef}
          className={`pointer-events-auto relative bg-surface-elevated border border-stroke-default rounded-card shadow-elevated w-full p-6 animate-modal-panel ${size === "lg" ? "max-w-lg" : "max-w-md"}`}
        >
          {/* Header row: optional title + (gated) close button */}
          {title != null && (
            <div className="flex items-center justify-between mb-4">
              <h2 id={titleId} className="text-section-title font-display text-content-primary">
                {title}
              </h2>
              {closeVisible && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="text-content-tertiary hover:text-content-primary transition-colors duration-fast p-1 -mr-1 rounded-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* No title, but close explicitly requested: floating close top-right.
              Un-migrated modals that pass neither title nor showClose keep their
              own hand-rolled close button with no duplicate. */}
          {title == null && closeVisible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="absolute top-4 right-4 text-content-tertiary hover:text-content-primary transition-colors duration-fast p-1 rounded-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Hidden title for aria-labelledby when no visible title */}
          {title == null && <span id={titleId} className="sr-only">Dialog</span>}

          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── ConfirmModal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "default" | "danger";
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && (
        <p className="text-body text-content-secondary mb-6">{description}</p>
      )}
      <div className="flex gap-3 justify-end mt-6">
        <Button variant="ghost" size="md" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          size="md"
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
