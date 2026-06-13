"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type { ToastVariant };

// ── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastFn {
  (opts: { title: string; description?: string; variant?: ToastVariant }): void;
}

interface ToastContextValue {
  toast: ToastFn;
}

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast: ToastFn = useCallback(({ title, description, variant = "success" }) => {
    const id = nextId.current++;
    const duration = variant === "error" ? 8000 : 4000;
    setToasts((prev) => {
      const next = [...prev, { id, title, description, variant, duration }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Toast Card ───────────────────────────────────────────────────────────────

const icons: Record<ToastVariant, ReactNode> = {
  success: (
    <svg className="h-5 w-5 text-accent-green shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5 text-accent-red shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5 text-accent-blue shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
    </svg>
  ),
};

const progressColor: Record<ToastVariant, string> = {
  success: "bg-accent-green",
  error:   "bg-accent-red",
  info:    "bg-brand-500",
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [exiting, setExiting] = useState(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const startExit = useCallback(() => {
    clearTimeout(autoTimer.current);
    clearTimeout(exitTimer.current);
    setExiting(true);
    exitTimer.current = setTimeout(() => onDismiss(item.id), 200);
  }, [item.id, onDismiss]);

  useEffect(() => {
    autoTimer.current = setTimeout(startExit, item.duration);
    return () => {
      clearTimeout(autoTimer.current);
      clearTimeout(exitTimer.current);
    };
  }, [item.id, item.duration, startExit]);

  return (
    <div
      className={`pointer-events-auto bg-surface-elevated border border-stroke-strong rounded-card shadow-elevated min-w-[320px] max-w-[420px] overflow-hidden transition-all duration-normal motion-reduce:transition-none ${
        exiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
      }`}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {icons[item.variant]}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-content-primary">{item.title}</p>
          {item.description && (
            <p className="text-xs text-content-secondary mt-0.5">{item.description}</p>
          )}
        </div>
        <button
          onClick={startExit}
          className="text-content-tertiary hover:text-content-primary shrink-0 transition-colors duration-fast"
          aria-label="Dismiss notification"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 bg-surface-overlay">
        <div
          className={`h-full ${progressColor[item.variant]}`}
          style={{
            animation: `toast-progress ${item.duration}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}
