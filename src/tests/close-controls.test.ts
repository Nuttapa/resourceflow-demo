import { describe, expect, it } from 'vitest';
import { expirable, returnable, visibleAllocations } from '@/lib/views';
import { applyAction } from '@/lib/dispatch';
import { describeOutcome } from '@/lib/notify';
import { capacityViolations, computeUsage, usageByPool } from '@/lib/capacity';
import { isOverdue } from '@/lib/format';
import { allocation, available, expectRefusedCleanly, freshState, request, testEnv, user } from './helpers';
import type { DemoState } from '@/lib/types';

function rowFor(state: DemoState, actorId: string, allocationId: string) {
  const row = visibleAllocations(state, user(state, actorId)).find((r) => r.allocation.id === allocationId);
  if (!row) throw new Error(`${actorId} cannot see ${allocationId}`);
  return row;
}

describe('which close controls are offered', () => {
  it('offers Return to the owner of the request', () => {
    const state = freshState();
    expect(returnable(user(state, 'u-aree'), rowFor(state, 'u-aree', 'alloc-2001'))).toBe(true);
  });

  it('offers Return and Expire to an administrator', () => {
    const state = freshState();
    const row = rowFor(state, 'u-admin', 'alloc-2001');
    expect(returnable(user(state, 'u-admin'), row)).toBe(true);
    expect(expirable(user(state, 'u-admin'), row)).toBe(true);
  });

  it('offers neither to an approver who does not own the request', () => {
    const state = freshState();
    const row = rowFor(state, 'u-admin', 'alloc-2001');
    expect(returnable(user(state, 'u-pradit'), row)).toBe(false);
    expect(expirable(user(state, 'u-pradit'), row)).toBe(false);
  });

  it('does not offer Expire to the owning requester', () => {
    const state = freshState();
    expect(expirable(user(state, 'u-aree'), rowFor(state, 'u-aree', 'alloc-2001'))).toBe(false);
  });

  it('offers nothing once the allocation is closed', () => {
    const state = freshState();
    const row = rowFor(state, 'u-admin', 'alloc-2003'); // already RETURNED
    expect(returnable(user(state, 'u-admin'), row)).toBe(false);
    expect(expirable(user(state, 'u-admin'), row)).toBe(false);
  });

  it('does not offer Return when the request record is missing', () => {
    const base = freshState();
    const orphaned: DemoState = {
      ...base,
      requests: base.requests.filter((r) => r.id !== 'req-1001'),
    };
    const row = visibleAllocations(orphaned, user(base, 'u-admin')).find((r) => r.allocation.id === 'alloc-2001')!;
    expect(row.request).toBeUndefined();
    expect(returnable(user(base, 'u-admin'), row)).toBe(false);
  });
});

describe('returning through dispatch', () => {
  it('closes the allocation, moves the request and frees capacity', () => {
    const state = freshState();
    const cpuBefore = available(state, 'pool-cpu');
    const baselineBefore = computeUsage(state).map((u) => u.baselineAllocated);

    const result = applyAction(
      state,
      user(state, 'u-aree'),
      { type: 'allocation:return', allocationId: 'alloc-2001', reason: 'Project finished early' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(allocation(result.state, 'alloc-2001').status).toBe('RETURNED');
    expect(request(result.state, 'req-1001').status).toBe('RETURNED');
    expect(available(result.state, 'pool-cpu')).toBe(cpuBefore + 4);
    expect(computeUsage(result.state).map((u) => u.baselineAllocated)).toEqual(baselineBefore);
    expect(result.state.pools).toEqual(state.pools);
    expect(capacityViolations(result.state)).toEqual([]);
    expect(result.audit.reason).toBe('Project finished early');
  });

  it('refuses a requester returning someone else allocation', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-kittipong'),
      { type: 'allocation:return', allocationId: 'alloc-2001' },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_OWNER');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses an approver who does not own the request', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'allocation:return', allocationId: 'alloc-2001' },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses returning twice and credits capacity only once', () => {
    const state = freshState();
    const first = applyAction(state, user(state, 'u-aree'), { type: 'allocation:return', allocationId: 'alloc-2001' }, testEnv());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyAction(first.state, user(state, 'u-aree'), { type: 'allocation:return', allocationId: 'alloc-2001' }, testEnv());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('INVALID_STATE');
    expectRefusedCleanly(first.state, second.state);
    expect(available(second.state, 'pool-cpu')).toBe(available(first.state, 'pool-cpu'));
  });

  it('never reports success when the save failed', () => {
    const state = freshState();
    const result = applyAction(state, user(state, 'u-aree'), { type: 'allocation:return', allocationId: 'alloc-2001' }, testEnv());
    for (const persistence of ['READY', 'READ_ONLY', 'UNAVAILABLE'] as const) {
      expect(describeOutcome(result, false, persistence).tone).toBe('warning');
    }
    expect(describeOutcome(result, true, 'READY').tone).toBe('success');
  });
});

describe('manual expiry through dispatch', () => {
  it('is administrator-only', () => {
    const state = freshState();
    for (const id of ['u-aree', 'u-kittipong', 'u-pradit', 'u-sunee']) {
      const result = applyAction(
        state,
        user(state, id),
        { type: 'allocation:expire', allocationId: 'alloc-2002', reason: 'cleanup' },
        testEnv(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('NOT_PERMITTED');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('requires a reason that is not just whitespace', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-admin'),
      { type: 'allocation:expire', allocationId: 'alloc-2002', reason: '  \n ' },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.errors?.[0]?.field).toBe('reason');
    expectRefusedCleanly(state, result.state);
  });

  it('closes the allocation and records actor and reason in the audit entry', () => {
    const state = freshState();
    const gpuBefore = available(state, 'pool-gpu');
    const result = applyAction(
      state,
      user(state, 'u-admin'),
      { type: 'allocation:expire', allocationId: 'alloc-2002', reason: 'Past its end date' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(allocation(result.state, 'alloc-2002').status).toBe('EXPIRED');
    expect(allocation(result.state, 'alloc-2002').closedBy).toBe('u-admin');
    expect(request(result.state, 'req-1002').status).toBe('EXPIRED');
    expect(available(result.state, 'pool-gpu')).toBe(gpuBefore + 2);
    expect(result.audit.actorId).toBe('u-admin');
    expect(result.audit.actorRole).toBe('ADMIN');
    expect(result.audit.action).toBe('allocation:expire');
    expect(result.audit.reason).toBe('Past its end date');
  });

  it('refuses expiring twice', () => {
    const state = freshState();
    const first = applyAction(
      state,
      user(state, 'u-admin'),
      { type: 'allocation:expire', allocationId: 'alloc-2002', reason: 'first' },
      testEnv(),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyAction(
      first.state,
      user(state, 'u-admin'),
      { type: 'allocation:expire', allocationId: 'alloc-2002', reason: 'again' },
      testEnv(),
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('INVALID_STATE');
    expectRefusedCleanly(first.state, second.state);
  });

  it('leaves an overdue allocation alone until someone acts', () => {
    const state = freshState();
    // alloc-2002 is past its end date in the seed data.
    expect(isOverdue(allocation(state, 'alloc-2002'), '2026-10-12T00:00:00.000Z')).toBe(true);
    expect(allocation(state, 'alloc-2002').status).toBe('ALLOCATED');
    expect(usageByPool(state).get('pool-gpu')!.activeAllocated).toBe(2);
  });
});

describe('round trips', () => {
  const draft = {
    title: 'Round trip fixture',
    purpose: 'Create, approve, allocate and then close the allocation.',
    items: [{ poolId: 'pool-cpu', quantity: 3 }, { poolId: 'pool-mem', quantity: 8 }],
    durationDays: 7,
  };

  function runTo(mode: 'RETURN' | 'EXPIRE') {
    const start = freshState();
    const env = testEnv();
    const pools = ['pool-cpu', 'pool-mem', 'pool-disk', 'pool-gpu'] as const;
    const before = Object.fromEntries(pools.map((p) => [p, available(start, p)]));
    const baselineBefore = computeUsage(start).map((u) => u.baselineAllocated);

    const created = applyAction(start, user(start, 'u-aree'), { type: 'request:create', draft }, env);
    if (!created.ok) throw new Error('create failed');
    const id = created.state.requests.at(-1)!.id;

    const approved = applyAction(
      created.state,
      user(start, 'u-pradit'),
      { type: 'request:decide', requestId: id, decision: 'APPROVE' },
      env,
    );
    if (!approved.ok) throw new Error('approve failed');

    const allocated = applyAction(approved.state, user(start, 'u-admin'), { type: 'allocation:create', requestId: id }, env);
    if (!allocated.ok) throw new Error('allocate failed');
    const allocId = allocated.state.allocations.at(-1)!.id;

    // capacity really was consumed in the middle
    expect(available(allocated.state, 'pool-cpu')).toBe(before['pool-cpu']! - 3);

    const closed =
      mode === 'RETURN'
        ? applyAction(allocated.state, user(start, 'u-aree'), { type: 'allocation:return', allocationId: allocId }, env)
        : applyAction(
            allocated.state,
            user(start, 'u-admin'),
            { type: 'allocation:expire', allocationId: allocId, reason: 'Force-closed for the demo' },
            env,
          );
    if (!closed.ok) throw new Error('close failed');

    return { start, closed: closed.state, id, allocId, before, baselineBefore, pools };
  }

  it('create -> approve -> allocate -> return restores every pool', () => {
    const { start, closed, id, allocId, before, baselineBefore, pools } = runTo('RETURN');

    for (const pool of pools) expect(available(closed, pool)).toBe(before[pool]);
    expect(computeUsage(closed).map((u) => u.baselineAllocated)).toEqual(baselineBefore);
    expect(closed.pools).toEqual(start.pools);
    expect(closed.requests.find((r) => r.id === id)!.status).toBe('RETURNED');
    expect(closed.allocations.find((a) => a.id === allocId)!.status).toBe('RETURNED');
    expect(closed.auditLog.length).toBe(start.auditLog.length + 4);
    expect(closed.auditLog.slice(-4).every((e) => e.outcome === 'ALLOWED')).toBe(true);
    expect(capacityViolations(closed)).toEqual([]);
  });

  it('create -> approve -> allocate -> admin expire restores every pool', () => {
    const { start, closed, id, allocId, before, baselineBefore, pools } = runTo('EXPIRE');

    for (const pool of pools) expect(available(closed, pool)).toBe(before[pool]);
    expect(computeUsage(closed).map((u) => u.baselineAllocated)).toEqual(baselineBefore);
    expect(closed.requests.find((r) => r.id === id)!.status).toBe('EXPIRED');
    expect(closed.allocations.find((a) => a.id === allocId)!.status).toBe('EXPIRED');
    const last = closed.auditLog.at(-1)!;
    expect(last.action).toBe('allocation:expire');
    expect(last.reason).toBe('Force-closed for the demo');
    expect(capacityViolations(closed)).toEqual([]);
  });
});
