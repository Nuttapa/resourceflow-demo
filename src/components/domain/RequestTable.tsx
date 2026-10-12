'use client';

import Link from 'next/link';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatQuantity } from '@/lib/format';
import type { DemoState, ResourceRequest } from '@/lib/types';

export function summariseItems(state: DemoState, request: ResourceRequest): string {
  return request.items
    .map((item) => {
      const pool = state.pools.find((p) => p.id === item.poolId);
      return pool ? `${formatQuantity(item.quantity, pool.unit)} ${pool.label}` : `${item.quantity} ?`;
    })
    .join(' · ');
}

/** Locale-independent so the server and the first client render agree. */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export interface RequestTableProps {
  state: DemoState;
  requests: ResourceRequest[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

export function RequestTable({
  state,
  requests,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: RequestTableProps) {
  const columns: Column<ResourceRequest>[] = [
    {
      key: 'code',
      header: 'Request',
      cell: (r) => (
        <span className="block">
          <span className="font-mono text-xs text-muted">{r.code}</span>
          <span className="block font-medium">{r.title}</span>
        </span>
      ),
    },
    {
      key: 'requester',
      header: 'Requester',
      cell: (r) => state.users.find((u) => u.id === r.requesterId)?.name ?? 'Unknown user',
    },
    {
      key: 'resources',
      header: 'Resources',
      cell: (r) => <span className="text-muted">{summariseItems(state, r)}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      align: 'right',
      cell: (r) => `${r.durationDays} days`,
      hideOnMobile: true,
    },
    {
      key: 'created',
      header: 'Submitted',
      align: 'right',
      cell: (r) => <span className="font-mono text-xs">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (r) => <StatusPill status={r.status} />,
    },
  ];

  return (
    <DataTable
      caption="Resource requests visible to the current demo session"
      columns={columns}
      rows={requests}
      rowKey={(r) => r.id}
      loading={loading}
      emptyTitle={emptyTitle ?? 'No requests to show'}
      emptyDescription={
        emptyDescription ??
        'This simulated session cannot see any requests yet. Create one, or switch persona in the header.'
      }
      emptyAction={emptyAction}
      rowAction={(r) => (
        <Link
          href={`/requests/detail/?id=${encodeURIComponent(r.id)}`}
          className="text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          Details<span className="sr-only"> for {r.code}</span>
        </Link>
      )}
    />
  );
}
