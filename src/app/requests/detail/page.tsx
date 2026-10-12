'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { StatusPill } from '@/components/ui/StatusPill';
import { StatusTimeline } from '@/components/domain/StatusTimeline';
import { summariseItems, formatDate } from '@/components/domain/RequestTable';
import { can } from '@/lib/permissions';
import { requestTimeline } from '@/lib/timeline';
import { allocationForRequest, cancellable, requesterName } from '@/lib/views';
import { ROLE_LABEL } from '@/lib/types';
import { useDemoState } from '@/state/DemoStateProvider';

const BackLink = () => (
  <Link href="/requests/" className="rounded-lg border border-line px-4 py-2 text-sm font-medium">
    Back to requests
  </Link>
);

function RequestDetail() {
  const searchParams = useSearchParams();
  const { state, activeUser, hydrated, dispatch } = useDemoState();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [working, setWorking] = useState(false);

  const id = searchParams.get('id')?.trim() ?? '';
  const request = useMemo(() => state.requests.find((r) => r.id === id), [state.requests, id]);
  const timeline = useMemo(() => (request ? requestTimeline(state, request.id) : []), [state, request]);

  if (!hydrated) {
    return (
      <>
        <PageHeader title="Request Details" />
        <Card>
          <CardBody>
            <div aria-busy="true" aria-live="polite" className="space-y-3">
              <span className="sr-only">Loading the request</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-elevated" />
              ))}
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  if (id.length === 0) {
    return (
      <>
        <PageHeader title="Request Details" action={<BackLink />} />
        <Card>
          <CardBody>
            <EmptyState
              title="No request was specified"
              description="This page needs a request id in the address, for example /requests/detail/?id=req-1003. Open a request from the list instead."
            />
          </CardBody>
        </Card>
      </>
    );
  }

  if (!request) {
    return (
      <>
        <PageHeader title="Request Details" action={<BackLink />} />
        <Card>
          <CardBody>
            <EmptyState
              title="That request was not found"
              description={`No request with the id "${id}" exists in this demo. It may have been removed by a demo reset, or the link may be mistyped.`}
            />
          </CardBody>
        </Card>
      </>
    );
  }

  // Authorisation is decided by the same rule the workflow uses. Nothing about
  // the request is rendered when it refuses.
  const view = can(activeUser, 'request:viewOne', { request });
  if (!view.allowed) {
    return (
      <>
        <PageHeader title="Request Details" action={<BackLink />} />
        <Card>
          <CardBody>
            <EmptyState
              title="You cannot open this request"
              description={`${view.reason ?? 'Not permitted.'} You are acting as ${activeUser.name} (${ROLE_LABEL[activeUser.role]}). Switch persona in the header to see what another role may open.`}
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const allocation = allocationForRequest(state, request.id);
  const showCancel = cancellable(activeUser, request);
  const refusedAttempts = timeline.filter((e) => e.outcome === 'DENIED').length;

  function confirmCancel() {
    if (working) return;
    setWorking(true);
    try {
      const outcome = dispatch({ type: 'request:cancel', requestId: request!.id, reason: cancelReason });
      // The toast already reports the result. Only close the dialog when the
      // cancellation both succeeded AND was saved.
      if (outcome.ok && outcome.persisted) {
        setConfirmOpen(false);
        setCancelReason('');
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader
        title={request.title}
        description={`${request.code} · filed by ${requesterName(state, request.requesterId)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <BackLink />
            {showCancel ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger"
              >
                Cancel request
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Request" description="Everything stored for this simulated request." />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
                <dd className="mt-1">
                  <StatusPill status={request.status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Submitted</dt>
                <dd className="mt-1 font-mono text-sm">{formatDate(request.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Requested duration</dt>
                <dd className="mt-1 text-sm">{request.durationDays} days</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Decision</dt>
                <dd className="mt-1 text-sm">
                  {request.decidedAt
                    ? `${formatDate(request.decidedAt)} by ${requesterName(state, request.decidedBy ?? '')}`
                    : 'Not decided yet'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted">Resources</dt>
                <dd className="mt-1 text-sm">{summariseItems(state, request)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted">Purpose</dt>
                <dd className="mt-1 whitespace-pre-line text-sm">{request.purpose}</dd>
              </div>
              {request.decisionNote ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted">Decision note</dt>
                  <dd className="mt-1 text-sm text-muted">&ldquo;{request.decisionNote}&rdquo;</dd>
                </div>
              ) : null}
            </dl>

            {allocation ? (
              <div className="mt-5 rounded-xl border border-line bg-elevated/40 p-4">
                <p className="text-sm font-medium">Linked allocation</p>
                <p className="mt-1 text-sm text-muted">
                  <span className="font-mono text-xs">{allocation.id}</span> ·{' '}
                  <StatusPill status={allocation.status} />
                </p>
                <p className="mt-1 text-xs text-muted">
                  Allocated {formatDate(allocation.allocatedAt)} · expires {formatDate(allocation.expiresAt)}
                  {allocation.closedAt ? ` · closed ${formatDate(allocation.closedAt)}` : ''}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Returning and expiring allocations is built in a later stage of this demo.
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Status timeline"
            description="Built from this demo's audit log and the stored records — nothing is invented."
          />
          <CardBody>
            <StatusTimeline events={timeline} />
            {refusedAttempts > 0 ? (
              <p className="mt-4 text-xs text-muted">
                {refusedAttempts} refused {refusedAttempts === 1 ? 'attempt is' : 'attempts are'} recorded
                above. Refused actions are logged but never change the request.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Cancel ${request.code}?`}
        description="The request stops here and cannot be approved later. This is recorded in the demo audit log."
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
            >
              Keep the request
            </button>
            <button
              type="button"
              onClick={confirmCancel}
              disabled={working}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {working ? 'Cancelling…' : 'Cancel request'}
            </button>
          </>
        }
      >
        <Textarea
          label="Reason (optional)"
          value={cancelReason}
          maxLength={500}
          rows={3}
          onChange={(event) => setCancelReason(event.target.value)}
          hint="Stored with the audit entry so the history explains itself."
        />
      </Dialog>
    </>
  );
}

export default function RequestDetailPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Request Details" />
          <Card>
            <CardBody>
              <div className="h-24 animate-pulse rounded-lg bg-elevated" />
            </CardBody>
          </Card>
        </>
      }
    >
      <RequestDetail />
    </Suspense>
  );
}
