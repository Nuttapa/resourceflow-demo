import { describe, expect, it } from 'vitest';
import {
  allocateRequest,
  createRequest,
  decideRequest,
  expireAllocation,
  returnAllocation,
} from '@/lib/workflow';
import { capacityViolations } from '@/lib/capacity';
import { isOverdue } from '@/lib/format';
import type { DemoState } from '@/lib/types';
import type { WorkflowEnv } from '@/lib/ids';
import {
  allocation,
  available,
  expectRefusedCleanly,
  freshState,
  request,
  testEnv,
  user,
} from './helpers';

// Seed fixtures: alloc-2001 belongs to u-aree (req-1001), alloc-2002 to u-nicha
// (req-1002), alloc-2003 is already RETURNED (req-1007).

describe('return - permission', () => {
  it('lets the owning requester return their own allocation', () => {
    const state = freshState();
    const cpuBefore = available(state, 'pool-cpu');

    const result = returnAllocation(state, user(state, 'u-aree'), 'alloc-2001', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(allocation(result.state, 'alloc-2001').status).toBe('RETURNED');
    expect(allocation(result.state, 'alloc-2001').closedBy).toBe('u-aree');
    expect(request(result.state, 'req-1001').status).toBe('RETURNED');
    expect(available(result.state, 'pool-cpu')).toBe(cpuBefore + 4);
    expect(capacityViolations(result.state)).toEqual([]);
  });

  it('refuses a requester returning somebody else allocation', () => {
    const state = freshState();
    const result = returnAllocation(state, user(state, 'u-kittipong'), 'alloc-2001', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_OWNER');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses an approver who does not own the request', () => {
    const state = freshState();
    const result = returnAllocation(state, user(state, 'u-pradit'), 'alloc-2001', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expect(result.reason).toContain('Administrator');
    expectRefusedCleanly(state, result.state);
  });

  it('lets an administrator return any allocation', () => {
    const state = freshState();
    const result = returnAllocation(state, user(state, 'u-admin'), 'alloc-2002', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(allocation(result.state, 'alloc-2002').closedBy).toBe('u-admin');
    expect(request(result.state, 'req-1002').status).toBe('RETURNED');
  });
});

describe('return - status', () => {
  it('refuses returning an allocation that was already returned', () => {
    const state = freshState();
    const result = returnAllocation(state, user(state, 'u-admin'), 'alloc-2003', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_STATE');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses returning the same allocation twice', () => {
    const state = freshState();
    const first = returnAllocation(state, user(state, 'u-aree'), 'alloc-2001', testEnv());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = returnAllocation(first.state, user(state, 'u-aree'), 'alloc-2001', testEnv());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('INVALID_STATE');
    expectRefusedCleanly(first.state, second.state);
    // capacity was credited exactly once
    expect(available(second.state, 'pool-cpu')).toBe(available(first.state, 'pool-cpu'));
  });

  it('refuses an unknown allocation id', () => {
    const state = freshState();
    const result = returnAllocation(state, user(state, 'u-admin'), 'alloc-ghost', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_FOUND');
    expectRefusedCleanly(state, result.state);
  });
});

describe('expire - administrator only, never automatic', () => {
  it('lets an administrator expire an active allocation, with a reason', () => {
    const state = freshState();
    const gpuBefore = available(state, 'pool-gpu');

    const result = expireAllocation(state, user(state, 'u-admin'), 'alloc-2002', 'Past its end date', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(allocation(result.state, 'alloc-2002').status).toBe('EXPIRED');
    expect(allocation(result.state, 'alloc-2002').closedBy).toBe('u-admin');
    expect(request(result.state, 'req-1002').status).toBe('EXPIRED');
    expect(available(result.state, 'pool-gpu')).toBe(gpuBefore + 2);
    expect(result.audit.action).toBe('allocation:expire');
    expect(result.audit.reason).toBe('Past its end date');
  });

  it('requires a reason', () => {
    const state = freshState();
    const result = expireAllocation(state, user(state, 'u-admin'), 'alloc-2002', '   ', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses a requester expiring their own allocation', () => {
    const state = freshState();
    const result = expireAllocation(state, user(state, 'u-aree'), 'alloc-2001', 'let me', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses an approver', () => {
    const state = freshState();
    const result = expireAllocation(state, user(state, 'u-pradit'), 'alloc-2001', 'cleanup', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses expiring an allocation that is already closed', () => {
    const state = freshState();
    const result = expireAllocation(state, user(state, 'u-admin'), 'alloc-2003', 'cleanup', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_STATE');
    expectRefusedCleanly(state, result.state);
  });

  it('marks an overdue allocation without changing its status', () => {
    const state = freshState();
    // alloc-2002 expired on 2026-10-11; nothing in the system touches it.
    expect(isOverdue(allocation(state, 'alloc-2002'), '2026-10-12T00:00:00.000Z')).toBe(true);
    expect(allocation(state, 'alloc-2002').status).toBe('ALLOCATED');
    expect(isOverdue(allocation(state, 'alloc-2003'), '2030-01-01T00:00:00.000Z')).toBe(false);
  });
});

describe('complete round trip', () => {
  it('create -> approve -> allocate -> return leaves capacity exactly as it started', () => {
    const start = freshState();
    const env = testEnv();
    const pools = ['pool-cpu', 'pool-mem', 'pool-disk', 'pool-gpu'] as const;
    const before = Object.fromEntries(pools.map((p) => [p, available(start, p)]));

    const created = createdRequest(start, env);
    const approvedResult = decideRequest(created.state, user(start, 'u-pradit'), created.id, 'APPROVE', undefined, env);
    expect(approvedResult.ok).toBe(true);
    if (!approvedResult.ok) return;

    const allocated = allocateRequest(approvedResult.state, user(start, 'u-admin'), created.id, env);
    expect(allocated.ok).toBe(true);
    if (!allocated.ok) return;

    // capacity really was consumed in the middle of the trip
    expect(available(allocated.state, 'pool-cpu')).toBe(before['pool-cpu']! - 3);

    const newAllocation = allocated.state.allocations[allocated.state.allocations.length - 1]!;
    const returned = returnAllocation(allocated.state, user(start, 'u-aree'), newAllocation.id, env);
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;

    for (const pool of pools) {
      expect(available(returned.state, pool)).toBe(before[pool]);
    }
    expect(capacityViolations(returned.state)).toEqual([]);
    expect(request(returned.state, created.id).status).toBe('RETURNED');
    // four actions, four audit entries, all ALLOWED
    expect(returned.state.auditLog.length).toBe(start.auditLog.length + 4);
    expect(returned.state.auditLog.slice(-4).every((e) => e.outcome === 'ALLOWED')).toBe(true);
  });
});

function createdRequest(state: DemoState, env: WorkflowEnv) {
  const result = createRequest(
    state,
    user(state, 'u-aree'),
    {
      title: 'Round trip fixture',
      purpose: 'Exercise the whole workflow end to end.',
      items: [{ poolId: 'pool-cpu', quantity: 3 }],
      durationDays: 7,
    },
    env,
  );
  if (!result.ok) throw new Error('fixture failed to create request');
  const created = result.state.requests[result.state.requests.length - 1]!;
  return { state: result.state, id: created.id };
}
