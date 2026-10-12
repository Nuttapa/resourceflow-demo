import { describe, expect, it } from 'vitest';
import { allocateRequest, decideRequest } from '@/lib/workflow';
import { capacityViolations, usageByPool } from '@/lib/capacity';
import { available, expectRefusedCleanly, freshState, request, testEnv, user } from './helpers';
import type { DemoState } from '@/lib/types';

/** Seed req-1003 (2 cpu, 8 mem, 100 disk) moved to APPROVED, ready to allocate. */
function approved(): DemoState {
  const state = freshState();
  const result = decideRequest(state, user(state, 'u-pradit'), 'req-1003', 'APPROVE', undefined, testEnv());
  if (!result.ok) throw new Error('fixture failed to approve');
  return result.state;
}

describe('allocate - happy path', () => {
  it('creates an allocation, moves the request to ALLOCATED and consumes capacity', () => {
    const state = approved();
    const cpuBefore = available(state, 'pool-cpu');

    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(request(result.state, 'req-1003').status).toBe('ALLOCATED');
    expect(result.state.allocations.length).toBe(state.allocations.length + 1);

    const created = result.state.allocations[result.state.allocations.length - 1]!;
    expect(created.requestId).toBe('req-1003');
    expect(created.status).toBe('ALLOCATED');
    expect(created.allocatedBy).toBe('u-admin');
    expect(created.items).toEqual(request(state, 'req-1003').items);

    expect(available(result.state, 'pool-cpu')).toBe(cpuBefore - 2);
    expect(capacityViolations(result.state)).toEqual([]);
  });

  it('sets expiry from the requested duration without any timer', () => {
    const state = approved();
    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.state.allocations[result.state.allocations.length - 1]!;
    // 14-day request allocated at the fixed clock start
    expect(created.allocatedAt).toBe('2026-10-12T00:00:00.000Z');
    expect(created.expiresAt).toBe('2026-10-26T00:00:00.000Z');
  });

  it('leaves the baseline untouched - only allocations move the numbers', () => {
    const state = approved();
    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pools).toEqual(state.pools);
    const usage = usageByPool(result.state).get('pool-cpu')!;
    expect(usage.baselineAllocated).toBe(14);
    expect(usage.activeAllocated).toBe(14); // 12 from the seed + 2 just allocated
    expect(usage.totalAllocated).toBe(28);
  });
});

describe('allocate - permission', () => {
  it('refuses an approver', () => {
    const state = approved();
    const result = allocateRequest(state, user(state, 'u-pradit'), 'req-1003', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses a requester, including the owner of the request', () => {
    const state = approved();
    const result = allocateRequest(state, user(state, 'u-kittipong'), 'req-1003', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, result.state);
  });
});

describe('allocate - status and duplicates', () => {
  it('refuses a request that is still PENDING', () => {
    const state = freshState();
    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1004', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_STATE');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses a rejected, cancelled or already-allocated request', () => {
    for (const id of ['req-1006', 'req-1001', 'req-1007']) {
      const state = freshState();
      const result = allocateRequest(state, user(state, 'u-admin'), id, testEnv());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('INVALID_STATE');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('refuses allocating the same request twice', () => {
    const state = approved();
    const first = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = allocateRequest(first.state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    // The status check fires first; either way nothing is allocated twice.
    expect(['INVALID_STATE', 'DUPLICATE_ACTION']).toContain(second.code);
    expectRefusedCleanly(first.state, second.state);
  });

  it('refuses an unknown request id', () => {
    const state = freshState();
    const result = allocateRequest(state, user(state, 'u-admin'), 'req-missing', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_FOUND');
    expectRefusedCleanly(state, result.state);
  });
});

describe('allocate - capacity limits', () => {
  /** Approve a request asking for `gpus` GPUs, filed by a requester. */
  function approvedGpuRequest(gpus: number): DemoState {
    const base = freshState();
    const patched: DemoState = {
      ...base,
      requests: base.requests.map((r) =>
        r.id === 'req-1003' ? { ...r, items: [{ poolId: 'pool-gpu', quantity: gpus }] } : r,
      ),
    };
    const result = decideRequest(patched, user(patched, 'u-pradit'), 'req-1003', 'APPROVE', undefined, testEnv());
    if (!result.ok) throw new Error('fixture failed');
    return result.state;
  }

  it('allows an allocation that fits exactly', () => {
    // seed: 6 GPUs total, 0 baseline, 2 active => 4 available
    const state = approvedGpuRequest(4);
    expect(available(state, 'pool-gpu')).toBe(4);

    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(available(result.state, 'pool-gpu')).toBe(0);
    expect(capacityViolations(result.state)).toEqual([]);
  });

  it('refuses an allocation that exceeds availability by one unit', () => {
    const state = approvedGpuRequest(5);
    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INSUFFICIENT_CAPACITY');
    expect(result.reason).toContain('available');
    expectRefusedCleanly(state, result.state);
    expect(available(result.state, 'pool-gpu')).toBe(4);
  });

  it('counts the baseline against availability', () => {
    // Raise the GPU baseline to 3: only 1 GPU is then free, so a 2-GPU ask fails.
    const base = approvedGpuRequest(2);
    const state: DemoState = {
      ...base,
      pools: base.pools.map((p) => (p.id === 'pool-gpu' ? { ...p, baselineAllocated: 3 } : p)),
    };
    expect(available(state, 'pool-gpu')).toBe(1);

    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INSUFFICIENT_CAPACITY');
    expectRefusedCleanly(state, result.state);
  });

  it('never lets capacity go negative on any path', () => {
    const state = approvedGpuRequest(6);
    const result = allocateRequest(state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(capacityViolations(result.state)).toEqual([]);
    expect(available(result.state, 'pool-gpu')).toBeGreaterThanOrEqual(0);
  });
});
