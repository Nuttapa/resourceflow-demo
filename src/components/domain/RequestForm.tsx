'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Field, SelectField } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Textarea';
import { usageByPool } from '@/lib/capacity';
import { LIMITS, validateRequestDraft, type FieldError, type RequestDraft } from '@/lib/validation';
import { useDemoState } from '@/state/DemoStateProvider';

interface DraftItem {
  poolId: string;
  /** Kept as text so an empty box is distinguishable from zero. */
  quantity: string;
}

const errorFor = (errors: FieldError[], field: string): string | undefined =>
  errors.find((e) => e.field === field)?.message;

export function RequestForm({ onCreated }: { onCreated: (requestId: string) => void }) {
  const { state, dispatch, hydrated, persistence } = useDemoState();

  const firstPoolId = state.pools[0]?.id ?? '';
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [durationDays, setDurationDays] = useState('14');
  const [items, setItems] = useState<DraftItem[]>([{ poolId: firstPoolId, quantity: '2' }]);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [unsavedWarning, setUnsavedWarning] = useState<string | null>(null);

  const usage = useMemo(() => usageByPool(state), [state]);

  const toDraft = (): RequestDraft => ({
    title,
    purpose,
    durationDays: durationDays.trim() === '' ? Number.NaN : Number(durationDays),
    items: items.map((item) => ({
      poolId: item.poolId,
      quantity: item.quantity.trim() === '' ? Number.NaN : Number(item.quantity),
    })),
  });

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    const used = new Set(items.map((i) => i.poolId));
    const nextPool = state.pools.find((p) => !used.has(p.id));
    if (!nextPool) return;
    setItems((current) => [...current, { poolId: nextPool.id, quantity: '1' }]);
  }

  function removeItem(index: number) {
    setItems((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setUnsavedWarning(null);
    const draft = toDraft();

    // First pass for inline messages. The workflow validates again on dispatch,
    // so this is a convenience, never the gate.
    const local = validateRequestDraft(draft, state.pools);
    setErrors(local.errors);
    if (!local.ok) return;

    setSubmitting(true);
    try {
      const outcome = dispatch({ type: 'request:create', draft });

      if (!outcome.ok) {
        // The workflow refused: keep everything the user typed.
        setErrors(outcome.result.ok ? [] : (outcome.result.errors ?? []));
        return;
      }

      if (!outcome.persisted) {
        setUnsavedWarning(
          'The request was created in this browser session but could not be saved to local storage, ' +
            'so it will disappear when you reload. Nothing has been lost from the form.',
        );
        return;
      }

      const created = outcome.result.ok ? outcome.result.state.requests.at(-1) : undefined;
      if (created) onCreated(created.id);
    } finally {
      setSubmitting(false);
    }
  }

  const canAddItem = items.length < Math.min(LIMITS.maxItems, state.pools.length);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field
        label="Request title"
        required
        value={title}
        maxLength={LIMITS.titleMax}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Senior project staging server"
        hint="A short name your approver will recognise."
        error={errorFor(errors, 'title')}
      />

      <Textarea
        label="Purpose"
        required
        value={purpose}
        maxLength={LIMITS.purposeMax}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="What the resources are for, and why this size."
        hint={`At least ${LIMITS.purposeMin} characters.`}
        error={errorFor(errors, 'purpose')}
      />

      <Field
        label="Duration (days)"
        required
        type="number"
        inputMode="numeric"
        min={LIMITS.durationMin}
        max={LIMITS.durationMax}
        step={1}
        value={durationDays}
        onChange={(e) => setDurationDays(e.target.value)}
        hint={`Between ${LIMITS.durationMin} and ${LIMITS.durationMax} days.`}
        error={errorFor(errors, 'durationDays')}
        className="sm:max-w-40"
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">
          Resources <span aria-hidden="true" className="text-danger">*</span>
        </legend>
        {errorFor(errors, 'items') ? (
          <p role="alert" className="text-xs text-danger">
            {errorFor(errors, 'items')}
          </p>
        ) : null}

        {items.map((item, index) => {
          const pool = state.pools.find((p) => p.id === item.poolId);
          const poolUsage = usage.get(item.poolId);
          return (
            <div
              key={`${item.poolId}-${index}`}
              className="grid gap-3 rounded-xl border border-line bg-elevated/40 p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-start"
            >
              <SelectField
                label="Resource"
                value={item.poolId}
                onChange={(e) => updateItem(index, { poolId: e.target.value })}
                error={errorFor(errors, `items[${index}].poolId`)}
              >
                {state.pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </SelectField>

              <Field
                label="Quantity"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: e.target.value })}
                hint={
                  poolUsage && hydrated
                    ? `${poolUsage.available} of ${poolUsage.total} ${poolUsage.unit} free`
                    : pool
                      ? `${pool.total} ${pool.unit} in total`
                      : undefined
                }
                error={errorFor(errors, `items[${index}].quantity`)}
              />

              <div className="sm:pt-7">
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-muted
                             hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove<span className="sr-only"> resource {index + 1}</span>
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addItem}
          disabled={!canAddItem}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium
                     hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add another resource
        </button>
      </fieldset>

      {unsavedWarning ? (
        <p role="alert" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {unsavedWarning}
        </p>
      ) : null}

      {persistence !== 'READY' && hydrated ? (
        <p className="text-xs text-muted">
          Browser storage is not writable right now, so anything you submit will live only in this
          session.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={submitting || !hydrated}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
        <p className="text-xs text-muted">
          Simulated submission. The workflow rules validate this again before anything is stored.
        </p>
      </div>
    </form>
  );
}
