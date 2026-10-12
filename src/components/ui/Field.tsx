'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

const CONTROL =
  'w-full rounded-lg border bg-surface px-3 py-2 text-sm placeholder:text-muted/70 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export interface FieldShellProps {
  label: string;
  /** Rendered below the control when there is no error. */
  hint?: string;
  error?: string;
  required?: boolean;
  children: (ids: { controlId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Wires a label, a hint and an error message to a control via ids, so screen
 * readers announce the same thing a sighted user reads. The error replaces the
 * hint rather than stacking, and is announced politely when it appears.
 */
export function FieldShell({ label, hint, error, required, children }: FieldShellProps) {
  const controlId = useId();
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({ controlId, describedBy, invalid: Boolean(error) })}

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-describedby' | 'aria-invalid'> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, required, className = '', ...input }: FieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <input
          {...input}
          id={controlId}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? 'border-danger' : 'border-line'} ${className}`}
        />
      )}
    </FieldShell>
  );
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'aria-describedby' | 'aria-invalid'> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({ label, hint, error, required, children, className = '', ...select }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <select
          {...select}
          id={controlId}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? 'border-danger' : 'border-line'} ${className}`}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}
