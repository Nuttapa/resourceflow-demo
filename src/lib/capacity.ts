import type { DemoState, RequestItem, ResourcePool } from './types';

export interface PoolUsage {
  poolId: string;
  label: string;
  unit: string;
  total: number;
  /** Pre-existing consumption that did not come from a demo Allocation. */
  baselineAllocated: number;
  /** Sum of every allocation currently in the ALLOCATED state. */
  activeAllocated: number;
  /** baselineAllocated + activeAllocated */
  totalAllocated: number;
  /** total - totalAllocated. Never negative in a valid state. */
  available: number;
}

/**
 * THE single source of truth for capacity numbers.
 *
 * Nothing stores a running total: usage is recomputed from the allocation
 * records every time, so allocate / return / expire cannot drift out of sync
 * with the pools. The only stored number is `baselineAllocated`, which the
 * workflow never changes.
 */
export function computeUsage(state: DemoState): PoolUsage[] {
  const active = new Map<string, number>();
  for (const allocation of state.allocations) {
    if (allocation.status !== 'ALLOCATED') continue;
    for (const item of allocation.items) {
      active.set(item.poolId, (active.get(item.poolId) ?? 0) + item.quantity);
    }
  }

  return state.pools.map((pool: ResourcePool): PoolUsage => {
    const activeAllocated = active.get(pool.id) ?? 0;
    const totalAllocated = pool.baselineAllocated + activeAllocated;
    return {
      poolId: pool.id,
      label: pool.label,
      unit: pool.unit,
      total: pool.total,
      baselineAllocated: pool.baselineAllocated,
      activeAllocated,
      totalAllocated,
      available: pool.total - totalAllocated,
    };
  });
}

export function usageByPool(state: DemoState): Map<string, PoolUsage> {
  return new Map(computeUsage(state).map((u) => [u.poolId, u]));
}

export interface CapacityCheck {
  ok: boolean;
  /** Populated when ok is false. */
  poolId?: string;
  reason?: string;
}

/**
 * Can `items` be allocated right now? Checked immediately before an allocation
 * is written, never earlier, so a stale screen cannot authorise an overcommit.
 */
export function checkCapacity(state: DemoState, items: readonly RequestItem[]): CapacityCheck {
  const usage = usageByPool(state);

  // Several items may target the same pool; charge them together.
  const wanted = new Map<string, number>();
  for (const item of items) {
    wanted.set(item.poolId, (wanted.get(item.poolId) ?? 0) + item.quantity);
  }

  for (const [poolId, quantity] of wanted) {
    const pool = usage.get(poolId);
    if (!pool) {
      return { ok: false, poolId, reason: `Unknown resource pool "${poolId}".` };
    }
    if (quantity > pool.available) {
      return {
        ok: false,
        poolId,
        reason:
          `Not enough ${pool.label} capacity: ${quantity} ${pool.unit} requested, ` +
          `${pool.available} ${pool.unit} available of ${pool.total}.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Invariants that must hold after every workflow action. Returns a list of
 * violations (empty when healthy) rather than throwing, so tests can assert on
 * it and the UI could surface it without crashing.
 */
export function capacityViolations(state: DemoState): string[] {
  const problems: string[] = [];
  for (const usage of computeUsage(state)) {
    if (usage.baselineAllocated < 0) problems.push(`Pool "${usage.poolId}" has a negative baseline.`);
    if (usage.activeAllocated < 0) problems.push(`Pool "${usage.poolId}" has negative active usage.`);
    if (usage.totalAllocated > usage.total) {
      problems.push(`Pool "${usage.poolId}" is overcommitted: ${usage.totalAllocated} of ${usage.total}.`);
    }
    if (usage.available < 0) problems.push(`Pool "${usage.poolId}" has negative availability.`);
  }
  return problems;
}
