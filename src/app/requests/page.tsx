'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SelectField, Field } from '@/components/ui/Field';
import { RequestTable } from '@/components/domain/RequestTable';
import { hiddenRequestCount, visibleRequests } from '@/lib/views';
import { REQUEST_STATUSES, ROLE_LABEL, type RequestStatus } from '@/lib/types';
import { useDemoState } from '@/state/DemoStateProvider';

const NEW_REQUEST_HREF = '/requests/new/';

export default function RequestsPage() {
  const { state, activeUser, hydrated } = useDemoState();
  const [status, setStatus] = useState<RequestStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => visibleRequests(state, activeUser), [state, activeUser]);
  const hidden = useMemo(() => hiddenRequestCount(state, activeUser), [state, activeUser]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visible.filter((request) => {
      if (status !== 'ALL' && request.status !== status) return false;
      if (needle.length === 0) return true;
      return (
        request.code.toLowerCase().includes(needle) ||
        request.title.toLowerCase().includes(needle)
      );
    });
  }, [visible, status, query]);

  const filtersActive = status !== 'ALL' || query.trim().length > 0;

  return (
    <>
      <PageHeader
        title="Resource Requests"
        description={`Requests this simulated session may see, acting as ${activeUser.name} (${ROLE_LABEL[activeUser.role]}).`}
        action={
          <Link
            href={NEW_REQUEST_HREF}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            New request
          </Link>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-[1fr_12rem]">
          <Field
            label="Search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Request code or title"
            hint="Filters only what you are already allowed to see."
          />
          <SelectField
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as RequestStatus | 'ALL')}
          >
            <option value="ALL">All statuses</option>
            {REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </SelectField>
        </div>

        <RequestTable
          state={state}
          requests={filtered}
          loading={!hydrated}
          emptyTitle={filtersActive ? 'No requests match these filters' : 'No requests to show'}
          emptyDescription={
            filtersActive
              ? 'Try clearing the search box or choosing a different status.'
              : 'This persona cannot see any requests yet. Create one, or switch persona in the header.'
          }
          emptyAction={
            filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setStatus('ALL');
                  setQuery('');
                }}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium"
              >
                Clear filters
              </button>
            ) : (
              <Link
                href={NEW_REQUEST_HREF}
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
              >
                Create the first request
              </Link>
            )
          }
        />
      </Card>

      {hydrated && hidden > 0 ? (
        <p className="mt-4 text-xs text-muted">
          {hidden} further {hidden === 1 ? 'request is' : 'requests are'} stored in this demo but hidden
          from the current persona by the permission rules. Switch persona to see what a different role
          is allowed to open.
        </p>
      ) : null}
    </>
  );
}
