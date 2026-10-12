'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import {
  auditActions,
  auditCounts,
  filterAudit,
  type OutcomeFilter,
  type RoleFilter,
  type TargetFilter,
} from '@/lib/auditview';
import { ROLES, ROLE_LABEL, type AuditEntry } from '@/lib/types';
import { useDemoState } from '@/state/DemoStateProvider';

const TARGET_TYPES: AuditEntry['targetType'][] = ['REQUEST', 'ALLOCATION', 'POOL', 'DEMO'];

export default function AuditPage() {
  const { state, hydrated } = useDemoState();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>('ALL');
  const [outcome, setOutcome] = useState<OutcomeFilter>('ALL');
  const [targetType, setTargetType] = useState<TargetFilter>('ALL');
  const [action, setAction] = useState<string>('ALL');

  const actions = useMemo(() => auditActions(state.auditLog), [state.auditLog]);
  const totals = useMemo(() => auditCounts(state.auditLog), [state.auditLog]);
  const rows = useMemo(
    () => filterAudit(state.auditLog, { query, role, outcome, targetType, action }),
    [state.auditLog, query, role, outcome, targetType, action],
  );

  const filtersActive =
    query.trim().length > 0 || role !== 'ALL' || outcome !== 'ALL' || targetType !== 'ALL' || action !== 'ALL';

  function clearFilters() {
    setQuery('');
    setRole('ALL');
    setOutcome('ALL');
    setTargetType('ALL');
    setAction('ALL');
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: 'at',
      header: 'When',
      cell: (entry) => (
        <time dateTime={entry.at} className="font-mono text-xs">
          {entry.at.slice(0, 16).replace('T', ' ')} UTC
        </time>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      cell: (entry) => (
        <span className="block">
          <span className="font-medium">{entry.actorName}</span>
          <span className="block text-xs text-muted">
            {ROLE_LABEL[entry.actorRole]} · <span className="font-mono">{entry.actorId}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (entry) => <span className="font-mono text-xs">{entry.action}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      hideOnMobile: true,
      cell: (entry) => (
        <span className="block">
          <span className="text-xs uppercase tracking-wide text-muted">{entry.targetType}</span>
          <span className="block font-mono text-xs">{entry.targetId}</span>
        </span>
      ),
    },
    {
      key: 'summary',
      header: 'Summary',
      cell: (entry) => (
        <span className="block">
          <span>{entry.summary}</span>
          {entry.reason ? <span className="mt-0.5 block text-xs text-muted">&ldquo;{entry.reason}&rdquo;</span> : null}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      align: 'right',
      cell: (entry) =>
        entry.outcome === 'ALLOWED' ? (
          <Badge tone="success">Allowed</Badge>
        ) : (
          <Badge tone="danger">Refused</Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Demo Audit Trail"
        description="Every action the workflow has taken in this browser, including the ones it refused. Append-only: nothing in this app edits or deletes an entry."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Entries</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated ? totals.total : '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Allowed</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-success">{hydrated ? totals.allowed : '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Refused</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-danger">{hydrated ? totals.denied : '—'}</p>
          <p className="mt-1 text-xs text-muted">Refused actions are recorded but change nothing.</p>
        </div>
      </div>

      <Card>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field
            label="Search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Action, target id, actor or summary"
          />
          <SelectField label="Actor role" value={role} onChange={(event) => setRole(event.target.value as RoleFilter)}>
            <option value="ALL">All roles</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as OutcomeFilter)}
          >
            <option value="ALL">Allowed and refused</option>
            <option value="ALLOWED">Allowed only</option>
            <option value="DENIED">Refused only</option>
          </SelectField>
          <SelectField
            label="Target type"
            value={targetType}
            onChange={(event) => setTargetType(event.target.value as TargetFilter)}
          >
            <option value="ALL">All targets</option>
            {TARGET_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <SelectField label="Action" value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="ALL">All actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>

        <DataTable
          caption="Demo audit entries, newest first"
          columns={columns}
          rows={rows}
          rowKey={(entry) => entry.id}
          loading={!hydrated}
          emptyTitle={filtersActive ? 'No entries match these filters' : 'No audit entries yet'}
          emptyDescription={
            filtersActive
              ? 'Try clearing the filters, or widen the outcome and role selection.'
              : 'Actions you take in this demo will appear here as soon as the workflow records them.'
          }
          emptyAction={
            filtersActive ? (
              <button type="button" onClick={clearFilters} className="rounded-lg border border-line px-3 py-2 text-sm font-medium">
                Clear filters
              </button>
            ) : null
          }
        />
      </Card>

      <p className="mt-4 text-xs text-muted">
        The sample history shipped with this demo covers only a few of the seeded records, so older requests
        may have no entries here at all. Nothing is back-filled to make the log look complete. Entries record
        who acted, what they attempted and the outcome — never credentials or the full contents of a request.
      </p>
    </>
  );
}
