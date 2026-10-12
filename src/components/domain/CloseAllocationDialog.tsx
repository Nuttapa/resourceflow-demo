'use client';

import { useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { StatusPill } from '@/components/ui/StatusPill';
import { usageByPool } from '@/lib/capacity';
import { formatQuantity } from '@/lib/format';
import { requesterName, type AllocationRow } from '@/lib/views';
import { useDemoState } from '@/state/DemoStateProvider';

export type CloseMode = 'RETURN' | 'EXPIRE';

/**
 * Return or force-expire one allocation. Both paths go through the same
 * workflow action family, which re-checks that the allocation exists, is still
 * ALLOCATED and that this persona may close it. A reason is mandatory for an
 * administrator's forced expiry and optional for a return.
 */
export function CloseAllocationDialog({
  row,
  mode,
  onClose,
}: {
  row: AllocationRow | null;
  mode: CloseMode;
  onClose: () => void;
}) {
  const { state, dispatch } = useDemoState();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const usage = useMemo(() => usageByPool(state), [state]);

  if (!row) return null;
  const { allocation, request } = row;
  const expiring = mode === 'EXPIRE';

  function close() {
    setReason('');
    setReasonError(undefined);
    setFailure(null);
    onClose();
  }

  function confirm() {
    if (working) return;

    if (expiring && reason.trim().length === 0) {
      setReasonError('A reason is required when forcing an allocation to expire.');
      return;
    }
    setReasonError(undefined);
    setFailure(null);
    setWorking(true);

    try {
      const outcome = expiring
        ? dispatch({ type: 'allocation:expire', allocationId: allocation.id, reason })
        : dispatch({ type: 'allocation:return', allocationId: allocation.id, reason });

      if (!outcome.ok) {
        const errors = outcome.result.ok ? [] : (outcome.result.errors ?? []);
        const fieldMessage = errors.find((e) => e.field === 'reason')?.message;
        if (fieldMessage) setReasonError(fieldMessage);
        else setFailure(outcome.reason ?? 'The workflow refused this action.');
        return;
      }

      if (!outcome.persisted) {
        setFailure(
          `The allocation was ${expiring ? 'expired' : 'returned'} in this browser session but could not be ` +
            'saved to local storage, so the change will disappear when you reload. Your reason has been kept.',
        );
        return;
      }

      close();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog
      open
      onClose={close}
      title={expiring ? `Force ${allocation.id} to expire?` : `Return the resources for ${request?.code ?? allocation.requestId}?`}
      description={
        expiring
          ? 'The allocation is closed as EXPIRED and its resources go back into the shared pools immediately.'
          : 'The allocation is closed as RETURNED and its resources go back into the shared pools immediately.'
      }
      footer={
        <>
          <button type="button" onClick={close} className="rounded-lg border border-line px-4 py-2 text-sm font-medium">
            Keep it running
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={working}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              expiring ? 'bg-danger text-white' : 'bg-accent text-accent-fg'
            }`}
          >
            {working
              ? expiring
                ? 'Expiring…'
                : 'Returning…'
              : expiring
                ? 'Expire allocation'
                : 'Return resources'}
          </button>
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Allocation</dt>
          <dd className="mt-1 font-mono text-xs">{allocation.id}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
          <dd className="mt-1">
            <StatusPill status={allocation.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Request</dt>
          <dd className="mt-1 text-sm">
            {request ? `${request.code} — ${request.title}` : <span className="text-muted">Request record not found</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Requester</dt>
          <dd className="mt-1 text-sm">{request ? requesterName(state, request.requesterId) : '—'}</dd>
        </div>
      </dl>

      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">Resources that will be returned to each pool</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2">Resource</th>
            <th scope="col" className="py-2 text-right">Returned</th>
            <th scope="col" className="py-2 text-right">Available after</th>
          </tr>
        </thead>
        <tbody>
          {allocation.items.map((item) => {
            const pool = usage.get(item.poolId);
            return (
              <tr key={item.poolId} className="border-b border-line/70 last:border-0">
                <td className="py-2">{pool?.label ?? item.poolId}</td>
                <td className="py-2 text-right tabular-nums">
                  {pool ? formatQuantity(item.quantity, pool.unit) : item.quantity}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {pool ? formatQuantity(pool.available + item.quantity, pool.unit) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4">
        <Textarea
          label={expiring ? 'Reason for forcing expiry' : 'Reason (optional)'}
          required={expiring}
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(event) => setReason(event.target.value)}
          hint={
            expiring
              ? 'Required. Stored with the audit entry so the forced expiry explains itself.'
              : 'Stored with the audit entry if you provide one.'
          }
          error={reasonError}
        />
      </div>

      {failure ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {failure}
        </p>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        The baseline usage of each pool is not affected — only this allocation is released.
      </p>
    </Dialog>
  );
}
