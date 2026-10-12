import { describe, expect, it } from 'vitest';
import { allocatableRequests, isAllocator, visibleAllocations } from '@/lib/views';
import { capacityViolations, computeUsage, usageByPool } from '@/lib/capacity';
import { applyAction } from '@/lib/dispatch';
import { describeOutcome } from '@/lib/notify';
import { isOverdue, percentUsed } from '@/lib/format';
import { allocation, available, expectRefusedCleanly, freshState, request, testEnv, user } from './helpers';
import type { DemoState } from '@/lib/types';

/** Seed req-1003 approved and ready for allocation. */
function approved(): DemoState {
  const state = freshState();
  const result = applyAction(
    state,
    user(state, 'u-pradit'),
    { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
    testEnv(),
  );
  if (!result.ok) throw new Error('fixture failed to approve');
  return result.state;
}

describe('visibleAllocations', () => {
  it('shows an administrator every allocation, newest first', () => {
    const state = freshState();
    const rows = visibleAllocations(state, user(state, 'u-admin'));
    expect(rows.length).toBe(state.allocations.length);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.allocation.allocatedAt >= rows[i]!.allocation.allocatedAt).toBe(true);
    }
  });

  it('shows a requester only the allocations behind their own requests', () => {
    const state = freshState();
    const rows = visibleAllocations(state, user(state, 'u-aree'));
    expect(rows.map((r) => r.allocation.id)).toEqual(['alloc-2001']);
    expect(rows[0]!.request?.requesterId).toBe('u-aree');
  });

  it('hides another person allocation from a requester', () => {
    const state = freshState();
    const ids = visibleAllocations(state, user(state, 'u-kittipong')).map((r) => r.allocation.id);
    expect(ids).not.toContain('alloc-2001');
    expect(ids).not.toContain('alloc-2002');
  });

  it('links every row to its request when the request still exists', () => {
    const state = freshState();
    for (const row of visibleAllocations(state, user(state, 'u-admin'))) {
      expect(row.request).toBeDefined();
      expect(row.request!.id).toBe(row.allocation.requestId);
    }
  });

  it('shows an orphaned allocation only to someone who may browse everything, and without a request', () => {
    const base = freshState();
    const orphaned: DemoState = {
      ...base,
      requests: base.requests.filter((r) => r.id !== 'req-1001'),
      allocations: base.allocations.filter((a) => a.requestId !== 'req-1007'),
    };
    const adminRow = visibleAllocations(orphaned, user(base, 'u-admin')).find((r) => r.allocation.id === 'alloc-2001');
    expect(adminRow).toBeDefined();
    expect(adminRow!.request).toBeUndefined();

    const requesterRows = visibleAllocations(orphaned, user(base, 'u-aree')).map((r) => r.allocation.id);
    expect(requesterRows).not.toContain('alloc-2001');
  });
});

describe('who may allocate, and what is waiting', () => {
  it('treats only an administrator as an allocator', () => {
    const state = freshState();
    expect(isAllocator(user(state, 'u-admin'))).toBe(true);
    expect(isAllocator(user(state, 'u-pradit'))).toBe(false);
    expect(isAllocator(user(state, 'u-aree'))).toBe(false);
  });

  it('lists nothing while no request is approved', () => {
    const state = freshState();
    expect(allocatableRequests(state, user(state, 'u-admin'))).toEqual([]);
  });

  it('lists an approved request that has no active allocation', () => {
    const state = approved();
    const waiting = allocatableRequests(state, user(state, 'u-admin'));
    expect(waiting.map((r) => r.id)).toEqual(['req-1003']);
  });

  it('is empty for roles that cannot allocate, even when something is approved', () => {
    const state = approved();
    expect(allocatableRequests(state, user(state, 'u-pradit'))).toEqual([]);
    expect(allocatableRequests(state, user(state, 'u-aree'))).toEqual([]);
  });

  it('drops the request from the waiting list once it is allocated', () => {
    const state = approved();
    const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(allocatableRequests(result.state, user(state, 'u-admin'))).toEqual([]);
  });
});

describe('the capacity dashboard reads computeUsage and nothing else', () => {
  it('keeps the baseline constant across an allocation', () => {
    const state = approved();
    const before = computeUsage(state).map((u) => u.baselineAllocated);
    const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(computeUsage(result.state).map((u) => u.baselineAllocated)).toEqual(before);
    expect(result.state.pools).toEqual(state.pools);
  });

  it('raises active usage by exactly what was allocated', () => {
    const state = approved();
    const before = usageByPool(state);
    const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = usageByPool(result.state);
    for (const item of request(state, 'req-1003').items) {
      expect(after.get(item.poolId)!.activeAllocated).toBe(before.get(item.poolId)!.activeAllocated + item.quantity);
      expect(after.get(item.poolId)!.available).toBe(before.get(item.poolId)!.available - item.quantity);
    }
  });

  it('holds the dashboard identities for every pool', () => {
    const state = approved();
    const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const pool of computeUsage(result.state)) {
      expect(pool.totalAllocated).toBe(pool.baselineAllocated + pool.activeAllocated);
      expect(pool.available).toBe(pool.total - pool.totalAllocated);
      expect(pool.available).toBeGreaterThanOrEqual(0);
      expect(pool.totalAllocated).toBeLessThan(pool.total + 1);
      expect(percentUsed(pool.totalAllocated, pool.total)).toBeGreaterThanOrEqual(0);
      expect(percentUsed(pool.totalAllocated, pool.total)).toBeLessThan(101);
    }
    expect(capacityViolations(result.state)).toEqual([]);
  });

  it('reports 0% for a pool with no capacity rather than dividing by zero', () => {
    const base = freshState();
    const empty: DemoState = {
      ...base,
      allocations: [],
      pools: base.pools.map((p) => ({ ...p, total: 0, baselineAllocated: 0 })),
    };
    for (const pool of computeUsage(empty)) {
      expect(pool.available).toBe(0);
      expect(percentUsed(pool.totalAllocated, pool.total)).toBe(0);
    }
    expect(capacityViolations(empty)).toEqual([]);
  });
});

describe('allocating through dispatch', () => {
  it('refuses every role except an administrator', () => {
    const state = approved();
    for (const id of ['u-pradit', 'u-sunee', 'u-aree', 'u-kittipong']) {
      const result = applyAction(state, user(state, id), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('NOT_PERMITTED');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('refuses a request that is not APPROVED', () => {
    const state = freshState();
    for (const id of ['req-1004', 'req-1006', 'req-1001', 'req-1007']) {
      const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: id }, testEnv());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('INVALID_STATE');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('refuses a duplicate allocation', () => {
    const state = approved();
    const first = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyAction(first.state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(['INVALID_STATE', 'DUPLICATE_ACTION']).toContain(second.code);
    expectRefusedCleanly(first.state, second.state);
    expect(second.state.allocations.filter((a) => a.requestId === 'req-1003').length).toBe(1);
  });

  it('keeps the request and its allocation in step', () => {
    const state = approved();
    const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const created = result.state.allocations.at(-1)!;
    expect(created.status).toBe('ALLOCATED');
    expect(request(result.state, 'req-1003').status).toBe('ALLOCATED');
    expect(created.items).toEqual(request(state, 'req-1003').items);
  });

  it('allows an allocation that fits exactly and refuses one unit more', () => {
    const base = freshState();
    function approvedGpu(count: number): DemoState {
      const patched: DemoState = {
        ...base,
        requests: base.requests.map((r) =>
          r.id === 'req-1003' ? { ...r, items: [{ poolId: 'pool-gpu', quantity: count }] } : r,
        ),
      };
      const decided = applyAction(
        patched,
        user(base, 'u-pradit'),
        { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
        testEnv(),
      );
      if (!decided.ok) throw new Error('fixture failed');
      return decided.state;
    }

    const exact = approvedGpu(4);
    const fits = applyAction(exact, user(base, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(fits.ok).toBe(true);
    if (fits.ok) expect(available(fits.state, 'pool-gpu')).toBe(0);

    const tooMuch = approvedGpu(5);
    const refused = applyAction(tooMuch, user(base, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe('INSUFFICIENT_CAPACITY');
    expectRefusedCleanly(tooMuch, refused.state);
  });

  it('writes an allowed audit entry naming the administrator', () => {
    const state = approved();
    const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit.action).toBe('allocation:create');
    expect(result.audit.targetType).toBe('ALLOCATION');
    expect(result.audit.outcome).toBe('ALLOWED');
    expect(result.audit.actorRole).toBe('ADMIN');
  });

  it('never reports success when the save failed', () => {
    const state = approved();
    const result = applyAction(state, user(state, 'u-admin'), { type: 'allocation:create', requestId: 'req-1003' }, testEnv());
    for (const persistence of ['READY', 'READ_ONLY', 'UNAVAILABLE'] as const) {
      expect(describeOutcome(result, false, persistence).tone).toBe('warning');
    }
    expect(describeOutcome(result, true, 'READY').tone).toBe('success');
  });
});

describe('overdue is a label, never a state change', () => {
  it('marks an allocation past its end date without touching its status', () => {
    const state = freshState();
    const past = allocation(state, 'alloc-2002'); // expires 2026-10-11
    expect(isOverdue(past, '2026-10-12T00:00:00.000Z')).toBe(true);
    expect(past.status).toBe('ALLOCATED');
    expect(state.allocations.find((a) => a.id === 'alloc-2002')!.status).toBe('ALLOCATED');
  });

  it('never marks a closed allocation overdue', () => {
    const state = freshState();
    expect(isOverdue(allocation(state, 'alloc-2003'), '2099-01-01T00:00:00.000Z')).toBe(false);
  });

  it('is false before the end date', () => {
    const state = freshState();
    expect(isOverdue(allocation(state, 'alloc-2001'), '2026-10-12T00:00:00.000Z')).toBe(false);
  });

  it('does not change capacity', () => {
    const state = freshState();
    const before = computeUsage(state);
    isOverdue(allocation(state, 'alloc-2002'), '2030-01-01T00:00:00.000Z');
    expect(computeUsage(state)).toEqual(before);
  });
});
