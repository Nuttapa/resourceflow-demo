'use client';

import { useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { checkCapacity, usageByPool } from '@/lib/capacity';
import { formatQuantity } from '@/lib/format';
import { requesterName } from '@/lib/views';
import { useDemoState } from '@/state/DemoStateProvider';
import type { ResourceRequest } from '@/lib/types';

/**
 * Confirm allocating the resources an approved request asked for.
 *
 * Quantities are not editable: the workflow allocates exactly what was approved,
 * so a partial allocation would make the request and its allocation disagree.
 * Everything here previews what the workflow will check, and the workflow
 * checks it again for real when the action is dispatched.
 */
export function AllocateDialog({
  request,
  onClose,
}: {
  request: ResourceRequest | null;
  onClose: () => void;
}) {
  const { state, dispatch } = useDemoState();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const usage = useMemo(() => usageByPool(state), [state]);
  const preview = useMemo(
    () => (request ? checkCapacity(state, request.items) : { ok: true }),
    [state, request],
  );

  if (!request) return null;

  function close() {
    setFailure(null);
    onClose();
  }

  function confirm() {
    if (working || !request) return;
    setWorking(true);
    setFailure(null);
    try {
      const outcome = dispatch({ type: 'allocation:create', requestId: request.id });

      if (!outcome.ok) {
        setFailure(outcome.reason ?? 'The workflow refused this allocation.');
        return;
      }
      if (!outcome.persisted) {
        setFailure(
          'The resources were allocated in this browser session but could not be saved to local storage, ' +
            'so the change will disappear when you reload.',
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
      title={`Allocate resources for ${request.code}`}
      description={`${request.title} — filed by ${requesterName(state, request.requesterId)}.`}
      footer={
        <>
          <button type="button" onClick={close} className="rounded-lg border border-line px-4 py-2 text-sm font-medium">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={working}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {working ? 'Allocating…' : 'Allocate resources'}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">
        The allocation will run for {request.durationDays} days from the moment it is created.
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">Requested resources and remaining capacity</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2">Resource</th>
            <th scope="col" className="py-2 text-right">Requested</th>
            <th scope="col" className="py-2 text-right">Available now</th>
          </tr>
        </thead>
        <tbody>
          {request.items.map((item) => {
            const pool = usage.get(item.poolId);
            const fits = pool ? item.quantity <= pool.available : false;
            return (
              <tr key={item.poolId} className="border-b border-line/70 last:border-0">
                <td className="py-2">{pool?.label ?? item.poolId}</td>
                <td className="py-2 text-right tabular-nums">
                  {pool ? formatQuantity(item.quantity, pool.unit) : item.quantity}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {pool ? (
                    <span className={fits ? '' : 'text-danger'}>
                      {formatQuantity(pool.available, pool.unit)}
                      {!fits ? <span className="ml-1.5"><Badge tone="danger">Short</Badge></span> : null}
                    </span>
                  ) : (
                    <Badge tone="danger">Unknown pool</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!preview.ok ? (
        <p role="note" className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {preview.reason} The workflow will refuse this allocation until capacity frees up.
        </p>
      ) : null}

      {failure ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {failure}
        </p>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        Allocating consumes capacity from the shared pools. Returning or expiring an allocation is an
        administrator action built in the next stage of this demo.
      </p>
    </Dialog>
  );
}
