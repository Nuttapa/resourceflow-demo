import { can, type PermissionResult } from './permissions';
import { canTransition } from './workflow';
import type { Allocation, DemoState, DemoUser, ResourceRequest } from './types';

/**
 * The requests a persona is allowed to see, newest first.
 *
 * Visibility is decided by `permissions.can('request:viewOne')` - the same rule
 * the detail screen and the workflow use - so a list can never show something a
 * direct visit would refuse, and there is no second copy of the rule to drift.
 */
export function visibleRequests(state: DemoState, actor: DemoUser): ResourceRequest[] {
  return state.requests
    .filter((request) => can(actor, 'request:viewOne', { request }).allowed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** How many requests exist that this persona may not see. For an honest count. */
export function hiddenRequestCount(state: DemoState, actor: DemoUser): number {
  return state.requests.length - visibleRequests(state, actor).length;
}

export function requesterName(state: DemoState, requesterId: string): string {
  return state.users.find((u) => u.id === requesterId)?.name ?? 'Unknown user';
}

/** The allocation for a request, if one was ever created. */
export function allocationForRequest(state: DemoState, requestId: string) {
  return state.allocations.find((a) => a.requestId === requestId);
}

/**
 * Whether the Cancel control should be offered at all. The workflow re-checks
 * both conditions when the action is dispatched; this only decides what to draw.
 */
export function cancellable(actor: DemoUser, request: ResourceRequest): boolean {
  return canTransition(request.status, 'CANCELLED') && can(actor, 'request:cancel', { request }).allowed;
}

export interface ReviewRow {
  request: ResourceRequest;
  /** Whether this persona may decide THIS request, and why not when they may not. */
  decision: PermissionResult;
}

/**
 * The pending requests this persona is allowed to see, each paired with the
 * verdict on whether they may decide it.
 *
 * A request the actor filed themselves stays in the list with the reason
 * attached rather than quietly disappearing: separation of duties is easier to
 * understand when you can see the thing you are not allowed to act on.
 */
export function reviewQueue(state: DemoState, actor: DemoUser): ReviewRow[] {
  return state.requests
    .filter((request) => request.status === 'PENDING')
    .filter((request) => can(actor, 'request:viewOne', { request }).allowed)
    .map((request) => ({ request, decision: can(actor, 'request:decide', { request }) }))
    .sort((a, b) => a.request.createdAt.localeCompare(b.request.createdAt));
}

/** Rows this persona can actually act on right now. */
export function decidableRows(rows: readonly ReviewRow[]): ReviewRow[] {
  return rows.filter((row) => row.decision.allowed);
}

/**
 * Does this role hold the reviewing capability at all?
 *
 * Asked by probing `permissions.can` with a request the actor does not own, so
 * the role matrix stays in one place. A persona that is merely blocked by
 * self-approval is still a reviewer; one refused with NOT_PERMITTED is not.
 */
export function isReviewer(state: DemoState, actor: DemoUser): boolean {
  const foreign = state.requests.find((r) => r.requesterId !== actor.id);
  const probe: ResourceRequest = foreign ?? {
    id: '__probe__',
    code: 'RF-0000',
    title: 'probe',
    purpose: 'probe',
    requesterId: state.users.find((u) => u.id !== actor.id)?.id ?? '__nobody__',
    items: [],
    durationDays: 1,
    status: 'PENDING',
    createdAt: '1970-01-01T00:00:00.000Z',
  };
  return can(actor, 'request:decide', { request: { ...probe, status: 'PENDING' } }).allowed;
}

/** Resource pools referenced by a set of requests, for a meaningful filter. */
export function poolsInRequests(state: DemoState, requests: readonly ResourceRequest[]) {
  const ids = new Set(requests.flatMap((r) => r.items.map((i) => i.poolId)));
  return state.pools.filter((p) => ids.has(p.id));
}

export interface AllocationRow {
  allocation: Allocation;
  /** The request this allocation was created from, when it can still be found. */
  request?: ResourceRequest;
}

/**
 * Allocations this persona may see, newest first.
 *
 * Visibility follows the linked request: if you may open the request, you may
 * see its allocation. An allocation whose request has gone missing is shown
 * only to someone who may browse everything, and is rendered without invented
 * detail rather than being silently dropped.
 */
export function visibleAllocations(state: DemoState, actor: DemoUser): AllocationRow[] {
  const rows: AllocationRow[] = [];
  for (const allocation of state.allocations) {
    const request = state.requests.find((r) => r.id === allocation.requestId);
    if (request) {
      if (!can(actor, 'request:viewOne', { request }).allowed) continue;
      rows.push({ allocation, request });
    } else if (can(actor, 'request:viewAll').allowed) {
      rows.push({ allocation });
    }
  }
  return rows.sort((a, b) => b.allocation.allocatedAt.localeCompare(a.allocation.allocatedAt));
}

/** Does this persona hold the allocating capability at all? */
export function isAllocator(actor: DemoUser): boolean {
  return can(actor, 'allocation:create').allowed;
}

/**
 * Approved requests that are still waiting for resources: nothing active is
 * holding capacity for them, and this persona is allowed to allocate.
 * The workflow checks all of this again when the action is dispatched.
 */
export function allocatableRequests(state: DemoState, actor: DemoUser): ResourceRequest[] {
  return state.requests
    .filter((request) => request.status === 'APPROVED')
    .filter((request) => !state.allocations.some((a) => a.requestId === request.id && a.status === 'ALLOCATED'))
    .filter((request) => can(actor, 'allocation:create', { request }).allowed)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Whether the Return control should be drawn for this row. The workflow checks
 * existence, status and permission again when the action is dispatched; this
 * only decides what the screen offers.
 */
export function returnable(actor: DemoUser, row: AllocationRow): boolean {
  if (row.allocation.status !== 'ALLOCATED') return false;
  if (!row.request) return false;
  return can(actor, 'allocation:return', { request: row.request, allocation: row.allocation }).allowed;
}

/** Whether the Expire control should be drawn. Administrator-only, by the same rule. */
export function expirable(actor: DemoUser, row: AllocationRow): boolean {
  if (row.allocation.status !== 'ALLOCATED') return false;
  return can(actor, 'allocation:expire', row.request ? { request: row.request, allocation: row.allocation } : {})
    .allowed;
}
