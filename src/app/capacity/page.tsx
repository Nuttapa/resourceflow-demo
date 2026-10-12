'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { CapacityBar } from '@/components/domain/CapacityBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { capacityViolations, computeUsage } from '@/lib/capacity';
import { formatQuantity, percentUsed } from '@/lib/format';
import { useDemoState } from '@/state/DemoStateProvider';

export default function CapacityPage() {
  const { state, hydrated } = useDemoState();

  const usage = useMemo(() => computeUsage(state), [state]);
  const violations = useMemo(() => capacityViolations(state), [state]);
  const activeAllocations = state.allocations.filter((a) => a.status === 'ALLOCATED').length;

  return (
    <>
      <PageHeader
        title="Resource Capacity"
        description="Utilisation of the simulated cluster. Every number is derived from the allocation records, never stored as a running total."
      />

      {violations.length > 0 ? (
        <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <p className="font-medium">Capacity invariants are broken in the stored demo data:</p>
          <ul className="mt-1 list-disc pl-5">
            {violations.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Resource pools</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated ? usage.length : '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Active allocations</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{hydrated ? activeAllocations : '—'}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-muted">Pools above 75% used</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {hydrated ? usage.filter((u) => percentUsed(u.totalAllocated, u.total) >= 75).length : '—'}
          </p>
        </div>
      </div>

      {hydrated && usage.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No resource pools are defined"
              description="This browser's demo data contains no resource pools, so there is nothing to measure. Resetting the demo data restores the sample cluster."
              action={
                <Link
                  href="/settings/reset/"
                  className="inline-block rounded-lg border border-line px-4 py-2 text-sm font-medium"
                >
                  Go to Reset Demo Data
                </Link>
              }
            />
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {usage.map((pool) => (
          <Card key={pool.poolId}>
            <CardBody>
              <CapacityBar usage={pool} />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="How these numbers are produced" description="One formula, one source of truth." />
        <CardBody>
          <p className="text-sm text-muted">
            <span className="font-medium text-fg">total allocated</span> = baseline + active demo allocations ·{' '}
            <span className="font-medium text-fg">available</span> = total − total allocated
          </p>
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-fg">Baseline</span> stands for workloads that already existed
            outside this demo. It is a constant: allocating, returning and expiring never change it. Nothing
            stores a running total, so the bars cannot drift away from the allocation records.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {usage.map((pool) => (
              <li key={pool.poolId}>
                <span className="font-medium text-fg">{pool.label}:</span>{' '}
                {formatQuantity(pool.baselineAllocated, pool.unit)} baseline +{' '}
                {formatQuantity(pool.activeAllocated, pool.unit)} allocated ={' '}
                {formatQuantity(pool.totalAllocated, pool.unit)} of {formatQuantity(pool.total, pool.unit)}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
