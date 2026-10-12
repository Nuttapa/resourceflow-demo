'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDemoState } from '@/state/DemoStateProvider';
import { ROLE_LABEL } from '@/lib/types';

export default function DashboardPage() {
  const { state, activeUser, hydrated } = useDemoState();

  const pending = state.requests.filter((r) => r.status === 'PENDING').length;
  const active = state.allocations.filter((a) => a.status === 'ALLOCATED').length;
  const mine = state.requests.filter((r) => r.requesterId === activeUser.id).length;

  const stats = [
    { label: 'Pending requests', value: pending, href: '/approvals/' },
    { label: 'Active allocations', value: active, href: '/allocations/' },
    { label: 'Your requests', value: mine, href: '/requests/' },
    { label: 'Resource pools', value: state.pools.length, href: '/capacity/' },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A simulated view of a shared academic compute cluster: who asked for what, what was approved, and what is currently in use."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-accent/40"
          >
            <p className="text-sm text-muted">{stat.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated ? stat.value : '—'}</p>
          </Link>
        ))}
      </div>

      {hydrated && state.requests.length === 0 ? (
        <Card className="mt-6">
          <CardBody>
            <EmptyState
              title="No requests have been filed yet"
              description="The counters above are empty because this browser's demo data contains no requests. File one to walk the workflow from request through approval and allocation to return."
              action={
                <Link
                  href="/requests/new/"
                  className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
                >
                  Create the first request
                </Link>
              }
            />
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your simulated session" description="Permissions below are evaluated against this persona." />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Acting as</dt>
                <dd className="font-medium">{activeUser.name}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Role</dt>
                <dd><Badge tone="accent">{ROLE_LABEL[activeUser.role]}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Email</dt>
                <dd className="font-mono text-xs">{activeUser.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Group</dt>
                <dd>{activeUser.department}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">
              Switch persona from the selector in the header. This is a simulation: there is no sign-in,
              no password and no session token anywhere in this application.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What this demo covers"
            description="Every item below is implemented and exercised by the test suite."
          />
          <CardBody>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2"><Badge tone="success">Built</Badge> Request submission, approval and rejection with a recorded reason</li>
              <li className="flex items-start gap-2"><Badge tone="success">Built</Badge> Resource allocation and derived capacity tracking</li>
              <li className="flex items-start gap-2"><Badge tone="success">Built</Badge> Return of resources and administrator-forced expiry</li>
              <li className="flex items-start gap-2"><Badge tone="success">Built</Badge> Role-based permission rules and a full audit trail</li>
              <li className="flex items-start gap-2"><Badge tone="success">Built</Badge> 254 automated tests across 17 files, plus a verified static build</li>
            </ul>
            <p className="mt-4 text-xs text-muted">
              This portfolio demo is hosted on Vercel and runs entirely in your browser. It uses simulated
              data and does not connect to any real system or backend.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
