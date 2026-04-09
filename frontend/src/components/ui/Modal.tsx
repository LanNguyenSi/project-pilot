"use client";

import { useEffect, useCallback, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open, handleKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-normal"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative bg-surface-secondary border border-stroke-default rounded-card shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in slide-in-from-bottom-2 duration-normal">
        {children}
      </div>
    </div>
  );
}

// ── ConfirmModal ────────────────────────────────────────────────────────────

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
    <Modal open={open} onClose={onClose}>
      <h2 className="text-section-title text-content-primary">{title}</h2>
      {description && (
        <p className="text-body text-content-secondary mt-2">{description}</p>
      )}
      <div className="flex gap-3 justify-end mt-6">
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-4 text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-tertiary rounded-button transition-colors duration-fast"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`h-9 px-4 text-sm font-medium text-white rounded-button transition-colors duration-fast disabled:opacity-50 ${
            variant === "danger"
              ? "bg-accent-red hover:bg-accent-red/90"
              : "bg-accent-blue hover:bg-accent-blue/90"
          }`}
        >
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            confirmLabel
          )}
        </button>
      </div>
    </Modal>
  );
}
