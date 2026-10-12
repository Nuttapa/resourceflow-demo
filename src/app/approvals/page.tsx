'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import { Badge } from '@/components/ui/Badge';
import { ApprovalPanel } from '@/components/domain/ApprovalPanel';
import { summariseItems, formatDate } from '@/components/domain/RequestTable';
import { decidableRows, isReviewer, poolsInRequests, requesterName, reviewQueue, type ReviewRow } from '@/lib/views';
import { ROLE_LABEL } from '@/lib/types';
import { useDemoState } from '@/state/DemoStateProvider';

export default function ApprovalsPage() {
  const { state, activeUser, hydrated } = useDemoState();
  const [query, setQuery] = useState('');
  const [poolId, setPoolId] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reviewer = useMemo(() => isReviewer(state, activeUser), [state, activeUser]);
  const rows = useMemo(() => (reviewer ? reviewQueue(state, activeUser) : []), [state, activeUser, reviewer]);
  const pools = useMemo(() => poolsInRequests(state, rows.map((r) => r.request)), [state, rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(({ request }) => {
      if (poolId !== 'ALL' && !request.items.some((item) => item.poolId === poolId)) return false;
      if (needle.length === 0) return true;
      return request.code.toLowerCase().includes(needle) || request.title.toLowerCase().includes(needle);
    });
  }, [rows, query, poolId]);

  const selected = useMemo(
    () => rows.find((row) => row.request.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const actionable = decidableRows(rows).length;
  const filtersActive = poolId !== 'ALL' || query.trim().length > 0;

  // A role without the reviewing capability sees an explanation and no queue:
  // no titles, no purposes, no requester names.
  if (hydrated && !reviewer) {
    return (
      <>
        <PageHeader title="Approval Queue" />
        <Card>
          <CardBody>
            <EmptyState
              title="This persona cannot review requests"
              description={`You are acting as ${activeUser.name} — ${ROLE_LABEL[activeUser.role]}. Only an Approver or an Administrator may approve or reject requests, so the queue is not shown. Switch persona in the header to review as someone who can.`}
              action={
                <Link href="/requests/" className="inline-block rounded-lg border border-line px-4 py-2 text-sm font-medium">
                  Go to your requests
                </Link>
              }
            />
          </CardBody>
        </Card>
      </>
    );
  }

  const columns: Column<ReviewRow>[] = [
    {
      key: 'request',
      header: 'Request',
      cell: ({ request, decision }) => (
        <span className="block">
          <span className="font-mono text-xs text-muted">{request.code}</span>
          <span className="block font-medium">{request.title}</span>
          {!decision.allowed ? (
            <span className="mt-1 inline-block">
              <Badge tone="warning">
                {decision.code === 'SELF_APPROVAL' ? 'Your own request' : 'Not yours to decide'}
              </Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'requester',
      header: 'Requester',
      cell: ({ request }) => requesterName(state, request.requesterId),
    },
    {
      key: 'purpose',
      header: 'Purpose',
      hideOnMobile: true,
      cell: ({ request }) => (
        <span className="line-clamp-2 block max-w-xs text-muted">{request.purpose}</span>
      ),
    },
    {
      key: 'resources',
      header: 'Resources',
      cell: ({ request }) => <span className="text-muted">{summariseItems(state, request)}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      hideOnMobile: true,
      cell: ({ request }) => `${request.durationDays} days`,
    },
    {
      key: 'created',
      header: 'Submitted',
      align: 'right',
      cell: ({ request }) => <span className="font-mono text-xs">{formatDate(request.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: ({ request }) => <StatusPill status={request.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Approval Queue"
        description={`Pending requests awaiting a decision, as ${activeUser.name} (${ROLE_LABEL[activeUser.role]}).`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Waiting for a decision</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated ? rows.length : '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">You can decide</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated ? actionable : '—'}</p>
          {hydrated && actionable < rows.length ? (
            <p className="mt-1 text-xs text-muted">
              {rows.length - actionable} blocked by separation of duties.
            </p>
          ) : null}
        </div>
      </div>

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-[1fr_14rem]">
          <Field
            label="Search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Request code or title"
            hint="Searches only the queue you are allowed to see."
          />
          <SelectField
            label="Resource type"
            value={poolId}
            onChange={(event) => setPoolId(event.target.value)}
          >
            <option value="ALL">All resource types</option>
            {pools.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.label}
              </option>
            ))}
          </SelectField>
        </div>

        <DataTable
          caption="Requests awaiting a decision"
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.request.id}
          loading={!hydrated}
          emptyTitle={filtersActive ? 'No pending requests match these filters' : 'Nothing is waiting for a decision'}
          emptyDescription={
            filtersActive
              ? 'Try clearing the search box or choosing a different resource type.'
              : 'Every request this persona can see has already been decided. Create a new request to try the workflow again.'
          }
          emptyAction={
            filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setPoolId('ALL');
                }}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium"
              >
                Clear filters
              </button>
            ) : (
              <Link
                href="/requests/new/"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
              >
                Create a request
              </Link>
            )
          }
          rowAction={(row) => (
            <button
              type="button"
              onClick={() => setSelectedId(row.request.id)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent/40"
            >
              {row.decision.allowed ? 'Review' : 'View'}
              <span className="sr-only"> {row.request.code}</span>
            </button>
          )}
        />
      </Card>

      <p className="mt-4 text-xs text-muted">
        Approving a request does not reserve any capacity. Allocation is a separate, administrator-only
        step that is built in the next stage of this demo.
      </p>

      <ApprovalPanel
        request={selected?.request ?? null}
        decision={selected?.decision ?? null}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
