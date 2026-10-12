'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { StatusPill } from '@/components/ui/StatusPill';
import { summariseItems, formatDate } from './RequestTable';
import { requestTimeline } from '@/lib/timeline';
import { requesterName } from '@/lib/views';
import { useDemoState } from '@/state/DemoStateProvider';
import type { PermissionResult } from '@/lib/permissions';
import type { ResourceRequest } from '@/lib/types';

export interface ApprovalPanelProps {
  request: ResourceRequest | null;
  decision: PermissionResult | null;
  onClose: () => void;
}

/**
 * Review one pending request and decide it. The workflow re-checks status,
 * permission and the rejection reason when the action is dispatched; everything
 * here is about showing the reviewer what they are deciding on.
 */
export function ApprovalPanel({ request, decision, onClose }: ApprovalPanelProps) {
  const { state, dispatch } = useDemoState();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);

  function close() {
    setReasonOpen(false);
    setReason('');
    setReasonError(undefined);
    onClose();
  }

  if (!request) return null;

  const canDecide = decision?.allowed === true;
  const timeline = requestTimeline(state, request.id);
  const refused = timeline.filter((e) => e.outcome === 'DENIED');

  function approve() {
    if (working || !request) return;
    setWorking(true);
    try {
      const outcome = dispatch({ type: 'request:decide', requestId: request.id, decision: 'APPROVE' });
      // The toast reports every outcome. Close only when it was decided AND saved.
      if (outcome.ok && outcome.persisted) close();
    } finally {
      setWorking(false);
    }
  }

  function reject() {
    if (working || !request) return;

    // Local check for an immediate message; the workflow enforces it for real.
    if (reason.trim().length === 0) {
      setReasonError('A reason is required when rejecting a request.');
      return;
    }
    setReasonError(undefined);

    setWorking(true);
    try {
      const outcome = dispatch({
        type: 'request:decide',
        requestId: request.id,
        decision: 'REJECT',
        note: reason,
      });
      if (outcome.ok && outcome.persisted) {
        close();
        return;
      }
      // Keep what was typed so it can be corrected and sent again.
      if (!outcome.ok) {
        const errors = outcome.result.ok ? [] : (outcome.result.errors ?? []);
        setReasonError(errors.find((e) => e.field === 'decisionNote')?.message ?? outcome.reason);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog
      open
      onClose={close}
      title={`${request.code} — ${request.title}`}
      description={`Filed by ${requesterName(state, request.requesterId)} on ${formatDate(request.createdAt)}.`}
      footer={
        canDecide ? (
          reasonOpen ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setReasonOpen(false);
                  setReasonError(undefined);
                }}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
              >
                Back
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={working}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {working ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setReasonOpen(true)}
                disabled={working}
                className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
              >
                Reject…
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={working}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
              >
                {working ? 'Approving…' : 'Approve'}
              </button>
            </>
          )
        ) : (
          <button type="button" onClick={close} className="rounded-lg border border-line px-4 py-2 text-sm font-medium">
            Close
          </button>
        )
      }
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
          <dd className="mt-1">
            <StatusPill status={request.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Requested duration</dt>
          <dd className="mt-1 text-sm">{request.durationDays} days</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted">Resources</dt>
          <dd className="mt-1 text-sm">{summariseItems(state, request)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted">Purpose</dt>
          <dd className="mt-1 whitespace-pre-line text-sm">{request.purpose}</dd>
        </div>
      </dl>

      {!canDecide && decision ? (
        <p role="note" className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {decision.reason ?? 'You cannot decide this request.'}
        </p>
      ) : null}

      {refused.length > 0 ? (
        <p className="mt-4 text-xs text-muted">
          {refused.length} refused {refused.length === 1 ? 'attempt is' : 'attempts are'} recorded against
          this request in the demo audit log.
        </p>
      ) : null}

      {reasonOpen ? (
        <div className="mt-4 border-t border-line pt-4">
          <Textarea
            label="Reason for rejection"
            required
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
            hint="Shown to the requester and stored with the audit entry."
            error={reasonError}
          />
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        <Link
          href={`/requests/detail/?id=${encodeURIComponent(request.id)}`}
          className="text-accent underline-offset-2 hover:underline"
        >
          Open the full request record
        </Link>{' '}
        for its complete status timeline.
      </p>
    </Dialog>
  );
}
