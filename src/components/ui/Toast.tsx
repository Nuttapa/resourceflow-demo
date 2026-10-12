'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Notice, NoticeTone } from '@/lib/notify';

export interface Toast extends Notice {
  id: number;
}

interface ToastApi {
  toasts: Toast[];
  /** Show a notice. Returns the id so a caller could dismiss it early. */
  push: (notice: Notice) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS: Record<NoticeTone, number | null> = {
  success: 5000,
  warning: 9000,
  // Errors stay until dismissed: a refusal reason is the point of the message.
  error: null,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (notice: Notice) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current.slice(-3), { ...notice, id }]);

      const ttl = AUTO_DISMISS_MS[notice.tone];
      if (ttl !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ttl),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastApi>(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}

const TONE_STYLE: Record<NoticeTone, { frame: string; icon: ReactNode; label: string }> = {
  success: {
    frame: 'border-success/40 bg-success/10 text-success',
    label: 'Success',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  warning: {
    frame: 'border-warning/40 bg-warning/10 text-warning',
    label: 'Warning',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
    ),
  },
  error: {
    frame: 'border-danger/40 bg-danger/10 text-danger',
    label: 'Refused',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    ),
  },
};

/**
 * Lives at the end of the app shell. Pinned bottom-right on desktop and across
 * the bottom on small screens, clear of the header, the sidebar and the
 * permanent demo banner.
 */
export function ToastViewport() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((toast) => {
        const style = TONE_STYLE[toast.tone];
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full max-w-md rounded-xl border px-4 py-3 shadow-card backdrop-blur ${style.frame}`}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">{style.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <span className="sr-only">{style.label}: </span>
                  {toast.title}
                </p>
                {toast.message ? <p className="mt-0.5 text-xs opacity-90">{toast.message}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
