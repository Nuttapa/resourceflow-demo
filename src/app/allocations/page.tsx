'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import { AllocateDialog } from '@/components/domain/AllocateDialog';
import { CloseAllocationDialog, type CloseMode } from '@/components/domain/CloseAllocationDialog';
import { formatDate, summariseItems } from '@/components/domain/RequestTable';
import {
  allocatableRequests,
  expirable,
  isAllocator,
  requesterName,
  returnable,
  visibleAllocations,
  type AllocationRow,
} from '@/lib/views';
import { ALLOCATION_STATUSES, ROLE_LABEL, type AllocationStatus } from '@/lib/types';
import { isOverdue } from '@/lib/format';
import { useDemoState } from '@/state/DemoStateProvider';

export default function AllocationsPage() {
  const { state, activeUser, hydrated } = useDemoState();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AllocationStatus | 'ALL'>('ALL');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ allocationId: string; mode: CloseMode } | null>(null);

  /**
   * The clock is read once after mount, never during render, so the server
   * markup and the first client render stay identical. Overdue is a label only:
   * nothing here changes an allocation's status.
   */
  const [nowIso, setNowIso] = useState<string | null>(null);
  useEffect(() => {
    setNowIso(new Date().toISOString());
  }, []);

  const rows = useMemo(() => visibleAllocations(state, activeUser), [state, activeUser]);
  const allocator = isAllocator(activeUser);
  const waiting = useMemo(
    () => (allocator ? allocatableRequests(state, activeUser) : []),
    [state, activeUser, allocator],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(({ allocation, request }) => {
      if (status !== 'ALL' && allocation.status !== status) return false;
      if (needle.length === 0) return true;
      return (
        allocation.id.toLowerCase().includes(needle) ||
        (request?.code.toLowerCase().includes(needle) ?? false) ||
        (request?.title.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [rows, query, status]);

  const active = rows.filter((row) => row.allocation.status === 'ALLOCATED').length;
  const overdue = nowIso ? rows.filter((row) => isOverdue(row.allocation, nowIso)).length : 0;
  const filtersActive = status !== 'ALL' || query.trim().length > 0;
  const selectedRequest = waiting.find((r) => r.id === selectedRequestId) ?? null;
  const closingRow = closing ? (rows.find((row) => row.allocation.id === closing.allocationId) ?? null) : null;

  const columns: Column<AllocationRow>[] = [
    {
      key: 'allocation',
      header: 'Allocation',
      cell: ({ allocation, request }) => (
        <span className="block">
          <span className="font-mono text-xs text-muted">{allocation.id}</span>
          <span className="block font-medium">
            {request ? request.title : <span className="text-muted">Request record not found</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'request',
      header: 'Request',
      cell: ({ allocation, request }) =>
        request ? (
          <Link
            href={`/requests/detail/?id=${encodeURIComponent(request.id)}`}
            className="font-mono text-xs text-accent underline-offset-2 hover:underline"
          >
            {request.code}
          </Link>
        ) : (
          <span className="font-mono text-xs text-muted">{allocation.requestId}</span>
        ),
    },
    {
      key: 'requester',
      header: 'Requester',
      hideOnMobile: true,
      cell: ({ request }) => (request ? requesterName(state, request.requesterId) : '—'),
    },
    {
      key: 'resources',
      header: 'Resources',
      cell: ({ allocation }) => (
        <span className="text-muted">
          {allocation.items
            .map((item) => {
              const pool = state.pools.find((p) => p.id === item.poolId);
              return pool ? `${item.quantity} ${pool.unit} ${pool.label}` : `${item.quantity} ${item.poolId}`;
            })
            .join(' · ')}
        </span>
      ),
    },
    {
      key: 'allocatedAt',
      header: 'Allocated',
      align: 'right',
      cell: ({ allocation }) => <span className="font-mono text-xs">{formatDate(allocation.allocatedAt)}</span>,
    },
    {
      key: 'expiresAt',
      header: 'Ends',
      align: 'right',
      cell: ({ allocation }) => (
        <span className="font-mono text-xs">
          {formatDate(allocation.expiresAt)}
          {allocation.closedAt ? (
            <span className="block text-muted">closed {formatDate(allocation.closedAt)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: ({ allocation }) => (
        <StatusPill status={allocation.status} overdue={nowIso ? isOverdue(allocation, nowIso) : false} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Allocations"
        description={`Resources currently held, and the history of what has been returned, as ${activeUser.name} (${ROLE_LABEL[activeUser.role]}).`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Active allocations</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated ? active : '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Past their end date</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{nowIso ? overdue : '—'}</p>
          <p className="mt-1 text-xs text-muted">A label only — nothing expires on its own.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Approved, awaiting resources</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated && allocator ? waiting.length : '—'}</p>
        </div>
      </div>

      {hydrated ? (
        <Card className="mb-4">
          <CardHeader
            title="Approved requests waiting for resources"
            description={
              allocator
                ? 'Allocating consumes capacity from the shared pools immediately.'
                : 'Only an Administrator can allocate resources in this demo.'
            }
          />
          <CardBody>
            {!allocator ? (
              <p className="text-sm text-muted">
                You are acting as {activeUser.name} — {ROLE_LABEL[activeUser.role]}. This role cannot allocate
                resources, so no allocation controls are offered. Switch persona in the header to try it as an
                Administrator.
              </p>
            ) : waiting.length === 0 ? (
              <EmptyState
                title="Nothing is waiting for resources"
                description="Every approved request already holds an allocation. Approve a pending request first to try this step."
                action={
                  <Link
                    href="/approvals/"
                    className="inline-block rounded-lg border border-line px-4 py-2 text-sm font-medium"
                  >
                    Go to the approval queue
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {waiting.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <span className="font-mono text-xs text-muted">{request.code}</span> {request.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {requesterName(state, request.requesterId)} · {summariseItems(state, request)} ·{' '}
                        {request.durationDays} days
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRequestId(request.id)}
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
                    >
                      Allocate<span className="sr-only"> resources for {request.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-[1fr_12rem]">
          <Field
            label="Search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Allocation id, request code or title"
            hint="Searches only the allocations you are allowed to see."
          />
          <SelectField
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as AllocationStatus | 'ALL')}
          >
            <option value="ALL">All statuses</option>
            {ALLOCATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </SelectField>
        </div>

        <DataTable
          caption="Allocations visible to the current demo session"
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.allocation.id}
          loading={!hydrated}
          emptyTitle={filtersActive ? 'No allocations match these filters' : 'No allocations to show'}
          emptyDescription={
            filtersActive
              ? 'Try clearing the search box or choosing a different status.'
              : 'This persona cannot see any allocations yet. Allocate an approved request, or switch persona in the header.'
          }
          emptyAction={
            filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatus('ALL');
                }}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium"
              >
                Clear filters
              </button>
            ) : null
          }
          rowAction={(row) => {
            const canReturn = returnable(activeUser, row);
            const canExpire = expirable(activeUser, row);
            if (!canReturn && !canExpire) {
              return row.allocation.status === 'ALLOCATED' ? (
                <span className="text-xs text-muted">No actions available</span>
              ) : null;
            }
            return (
              <span className="inline-flex flex-wrap justify-end gap-2">
                {canReturn ? (
                  <button
                    type="button"
                    onClick={() => setClosing({ allocationId: row.allocation.id, mode: 'RETURN' })}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent/40"
                  >
                    Return<span className="sr-only"> {row.allocation.id}</span>
                  </button>
                ) : null}
                {canExpire ? (
                  <button
                    type="button"
                    onClick={() => setClosing({ allocationId: row.allocation.id, mode: 'EXPIRE' })}
                    className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger"
                  >
                    Expire<span className="sr-only"> {row.allocation.id}</span>
                  </button>
                ) : null}
              </span>
            );
          }}
        />
      </Card>

      {overdue > 0 ? (
        <p className="mt-4 text-xs text-muted">
          {overdue} {overdue === 1 ? 'allocation is' : 'allocations are'} past their end date. They stay active
          until an Administrator expires them — this demo runs no timers and changes nothing on its own.
        </p>
      ) : null}

      <AllocateDialog request={selectedRequest} onClose={() => setSelectedRequestId(null)} />

      <CloseAllocationDialog
        row={closingRow}
        mode={closing?.mode ?? 'RETURN'}
        onClose={() => setClosing(null)}
      />
    </>
  );
}
