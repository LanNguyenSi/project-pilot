"use client";

import { useRef, useId, type ReactNode } from "react";
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
}

export function Modal({ open, onClose, children, title, showClose }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeVisible = showClose ?? title != null;

  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-modal-backdrop"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative bg-surface-elevated border border-stroke-default rounded-card shadow-elevated max-w-md w-full mx-4 p-6 animate-modal-panel"
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
