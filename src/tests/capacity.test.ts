import { describe, expect, it } from 'vitest';
import { capacityViolations, checkCapacity, computeUsage, usageByPool } from '@/lib/capacity';
import { percentUsed } from '@/lib/format';
import { allocateRequest, decideRequest, returnAllocation } from '@/lib/workflow';
import { freshState, testEnv, user } from './helpers';
import type { DemoState } from '@/lib/types';

describe('computeUsage on the seed data', () => {
  const expected = [
    { poolId: 'pool-cpu', total: 96, baselineAllocated: 14, activeAllocated: 12, totalAllocated: 26, available: 70 },
    { poolId: 'pool-mem', total: 384, baselineAllocated: 24, activeAllocated: 80, totalAllocated: 104, available: 280 },
    { poolId: 'pool-disk', total: 8000, baselineAllocated: 1400, activeAllocated: 200, totalAllocated: 1600, available: 6400 },
    { poolId: 'pool-gpu', total: 6, baselineAllocated: 0, activeAllocated: 2, totalAllocated: 2, available: 4 },
  ];

  it('matches the agreed capacity table exactly', () => {
    const usage = computeUsage(freshState());
    for (const row of expected) {
      const actual = usage.find((u) => u.poolId === row.poolId);
      expect(actual).toBeDefined();
      expect({
        poolId: actual!.poolId,
        total: actual!.total,
        baselineAllocated: actual!.baselineAllocated,
        activeAllocated: actual!.activeAllocated,
        totalAllocated: actual!.totalAllocated,
        available: actual!.available,
      }).toEqual(row);
    }
  });

  it('holds the identity available = total - (baseline + active)', () => {
    for (const u of computeUsage(freshState())) {
      expect(u.totalAllocated).toBe(u.baselineAllocated + u.activeAllocated);
      expect(u.available).toBe(u.total - u.totalAllocated);
    }
  });

  it('ignores allocations that are returned or expired', () => {
    const state = freshState();
    // alloc-2003 (4 cpu, 8 mem) is RETURNED and must not count.
    expect(usageByPool(state).get('pool-cpu')!.activeAllocated).toBe(12);
  });

  it('reports a seed state as having no violations', () => {
    expect(capacityViolations(freshState())).toEqual([]);
  });
});

describe('single source of truth', () => {
  it('never writes a running total back onto the pools', () => {
    const state = freshState();
    const approved = decideRequest(state, user(state, 'u-pradit'), 'req-1003', 'APPROVE', undefined, testEnv());
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    const allocated = allocateRequest(approved.state, user(state, 'u-admin'), 'req-1003', testEnv());
    expect(allocated.ok).toBe(true);
    if (!allocated.ok) return;
    expect(allocated.state.pools).toEqual(state.pools);

    const returnedAlloc = allocated.state.allocations[allocated.state.allocations.length - 1]!;
    const returned = returnAllocation(allocated.state, user(state, 'u-admin'), returnedAlloc.id, testEnv());
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    expect(returned.state.pools).toEqual(state.pools);
    expect(computeUsage(returned.state)).toEqual(computeUsage(state));
  });
});

describe('checkCapacity', () => {
  it('accepts a request that fits', () => {
    expect(checkCapacity(freshState(), [{ poolId: 'pool-gpu', quantity: 4 }]).ok).toBe(true);
  });

  it('accepts a request that fits exactly', () => {
    expect(checkCapacity(freshState(), [{ poolId: 'pool-cpu', quantity: 70 }]).ok).toBe(true);
  });

  it('refuses one unit over', () => {
    const result = checkCapacity(freshState(), [{ poolId: 'pool-cpu', quantity: 71 }]);
    expect(result.ok).toBe(false);
    expect(result.poolId).toBe('pool-cpu');
    expect(result.reason).toContain('70');
  });

  it('charges repeated items against the same pool together', () => {
    const items = [
      { poolId: 'pool-gpu', quantity: 3 },
      { poolId: 'pool-gpu', quantity: 2 },
    ];
    expect(checkCapacity(freshState(), items).ok).toBe(false);
  });

  it('refuses an unknown pool', () => {
    const result = checkCapacity(freshState(), [{ poolId: 'pool-tpu', quantity: 1 }]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Unknown');
  });

  it('refuses when the baseline alone leaves no room', () => {
    const base = freshState();
    const state: DemoState = {
      ...base,
      pools: base.pools.map((p) => (p.id === 'pool-gpu' ? { ...p, baselineAllocated: 4 } : p)),
    };
    expect(usageByPool(state).get('pool-gpu')!.available).toBe(0);
    expect(checkCapacity(state, [{ poolId: 'pool-gpu', quantity: 1 }]).ok).toBe(false);
  });
});

describe('capacityViolations', () => {
  it('flags an overcommitted pool', () => {
    const base = freshState();
    const state: DemoState = {
      ...base,
      pools: base.pools.map((p) => (p.id === 'pool-gpu' ? { ...p, total: 1 } : p)),
    };
    const problems = capacityViolations(state);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('overcommitted');
  });

  it('flags a negative baseline', () => {
    const base = freshState();
    const state: DemoState = {
      ...base,
      pools: base.pools.map((p) => (p.id === 'pool-cpu' ? { ...p, baselineAllocated: -1 } : p)),
    };
    expect(capacityViolations(state).length).toBeGreaterThan(0);
  });
});

describe('percentUsed', () => {
  it('rounds and clamps', () => {
    expect(percentUsed(26, 96)).toBe(27);
    expect(percentUsed(0, 96)).toBe(0);
    expect(percentUsed(96, 96)).toBe(100);
    expect(percentUsed(200, 96)).toBe(100);
    expect(percentUsed(-5, 96)).toBe(0);
    expect(percentUsed(5, 0)).toBe(0);
  });
});
