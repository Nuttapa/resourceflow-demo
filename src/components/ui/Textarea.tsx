'use client';

import type { TextareaHTMLAttributes } from 'react';
import { FieldShell } from './Field';

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'aria-describedby' | 'aria-invalid'> {
  label: string;
  hint?: string;
  error?: string;
  /** Shows a live "123 / 500" counter when set. */
  maxLength?: number;
}

export function Textarea({
  label,
  hint,
  error,
  required,
  maxLength,
  value,
  className = '',
  ...textarea
}: TextareaProps) {
  const used = typeof value === 'string' ? value.length : 0;
  const counter = maxLength ? `${used} / ${maxLength}` : undefined;

  return (
    <FieldShell
      label={label}
      hint={error ? undefined : [hint, counter].filter(Boolean).join(' · ') || undefined}
      error={error}
      required={required}
    >
      {({ controlId, describedBy, invalid }) => (
        <textarea
          {...textarea}
          id={controlId}
          value={value}
          required={required}
          maxLength={maxLength}
          rows={textarea.rows ?? 4}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`w-full resize-y rounded-lg border bg-surface px-3 py-2 text-sm
                      placeholder:text-muted/70 disabled:opacity-60
                      ${invalid ? 'border-danger' : 'border-line'} ${className}`}
        />
      )}
    </FieldShell>
  );
}
