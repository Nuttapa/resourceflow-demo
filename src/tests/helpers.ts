import { expect } from 'vitest';
import { createSeedState } from '@/lib/seed';
import { createFixedEnv } from '@/lib/ids';
import { capacityViolations, usageByPool } from '@/lib/capacity';
import type { Allocation, DemoState, DemoUser, ResourceRequest } from '@/lib/types';

/** Fresh seed state for every test; nothing is shared between cases. */
export const freshState = (): DemoState => createSeedState();

/** Deterministic clock and ids so every assertion is reproducible. */
export const testEnv = createFixedEnv;

export function user(state: DemoState, id: string): DemoUser {
  const found = state.users.find((u) => u.id === id);
  if (!found) throw new Error(`seed user ${id} is missing`);
  return found;
}

export function request(state: DemoState, id: string): ResourceRequest {
  const found = state.requests.find((r) => r.id === id);
  if (!found) throw new Error(`seed request ${id} is missing`);
  return found;
}

export function allocation(state: DemoState, id: string): Allocation {
  const found = state.allocations.find((a) => a.id === id);
  if (!found) throw new Error(`seed allocation ${id} is missing`);
  return found;
}

/** Everything except the audit log - a refused action may only touch the log. */
export function businessData(state: DemoState) {
  return {
    users: state.users,
    pools: state.pools,
    requests: state.requests,
    allocations: state.allocations,
    activeUserId: state.activeUserId,
  };
}

/**
 * Asserts the contract for a refused action: business data byte-for-byte
 * unchanged, exactly one new audit entry, and that entry marked DENIED.
 */
export function expectRefusedCleanly(before: DemoState, after: DemoState): void {
  expect(businessData(after)).toEqual(businessData(before));
  expect(after.auditLog.length).toBe(before.auditLog.length + 1);
  expect(after.auditLog[after.auditLog.length - 1]?.outcome).toBe('DENIED');
  expect(capacityViolations(after)).toEqual([]);
}

export function available(state: DemoState, poolId: string): number {
  const usage = usageByPool(state).get(poolId);
  if (!usage) throw new Error(`pool ${poolId} is missing`);
  return usage.available;
}
