'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  /** Buttons for the footer. The confirming action should come last. */
  footer?: ReactNode;
}

/**
 * Accessible modal built without a dependency: Escape closes it, focus moves in
 * on open and back to the trigger on close, Tab is trapped inside, the
 * background is inert to pointer events and the page behind cannot scroll.
 */
export function Dialog({ open, title, description, onClose, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-fg/50"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-t-2xl border border-line bg-surface shadow-card
                   sm:rounded-2xl max-h-[90dvh] overflow-y-auto"
      >
        <header className="border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          ) : null}
        </header>

        {children ? <div className="px-5 py-4">{children}</div> : null}

        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}
