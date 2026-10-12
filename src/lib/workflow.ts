import { appendAudit, createAuditEntry, type AuditInput } from './audit';
import { createSeedState } from './seed';
import { checkCapacity } from './capacity';
import { addDays } from './format';
import { nextRequestCode, type WorkflowEnv } from './ids';
import { can, type Action } from './permissions';
import { validateRequestDraft, type FieldError, type RequestDraft } from './validation';
import type {
  Allocation,
  AuditEntry,
  DemoState,
  DemoUser,
  RequestStatus,
  ResourceRequest,
} from './types';

export type WorkflowErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'NOT_PERMITTED'
  | 'NOT_OWNER'
  | 'SELF_APPROVAL'
  | 'MISSING_CONTEXT'
  | 'VALIDATION_FAILED'
  | 'INSUFFICIENT_CAPACITY'
  | 'DUPLICATE_ACTION';

export interface WorkflowSuccess {
  ok: true;
  /** New state, including the audit entry for this action. */
  state: DemoState;
  audit: AuditEntry;
}

export interface WorkflowFailure {
  ok: false;
  code: WorkflowErrorCode;
  reason: string;
  /**
   * The original state with ONLY an audit entry appended. Requests, allocations
   * and pools are untouched: a refused action is recorded, never applied.
   */
  state: DemoState;
  audit: AuditEntry;
  /** Field-level messages, present for VALIDATION_FAILED. */
  errors?: FieldError[];
}

export type WorkflowResult = WorkflowSuccess | WorkflowFailure;

/**
 * The only status changes this system will ever make. Everything else is
 * refused with INVALID_STATE, including every attempt to skip a step.
 */
export const ALLOWED_REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ALLOCATED'],
  ALLOCATED: ['RETURNED', 'EXPIRED'],
  REJECTED: [],
  CANCELLED: [],
  RETURNED: [],
  EXPIRED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_REQUEST_TRANSITIONS[from].includes(to);
}

// --------------------------------------------------------------------------
// result helpers - every path through this module produces an audit entry
// --------------------------------------------------------------------------

function succeed(
  state: DemoState,
  env: WorkflowEnv,
  actor: DemoUser,
  input: Omit<AuditInput, 'outcome'>,
): WorkflowSuccess {
  const audit = createAuditEntry(env, actor, { ...input, outcome: 'ALLOWED' });
  return { ok: true, state: appendAudit(state, audit), audit };
}

function fail(
  state: DemoState,
  env: WorkflowEnv,
  actor: DemoUser,
  code: WorkflowErrorCode,
  reason: string,
  input: Omit<AuditInput, 'outcome' | 'reason'>,
  errors?: FieldError[],
): WorkflowFailure {
  const audit = createAuditEntry(env, actor, { ...input, outcome: 'DENIED', reason });
  const next: WorkflowFailure = {
    ok: false,
    code,
    reason,
    state: appendAudit(state, audit),
    audit,
  };
  return errors ? { ...next, errors } : next;
}

/** Map a permission denial onto a workflow error code. */
function permissionCode(code: string | undefined): WorkflowErrorCode {
  switch (code) {
    case 'SELF_APPROVAL':
      return 'SELF_APPROVAL';
    case 'NOT_OWNER':
      return 'NOT_OWNER';
    case 'MISSING_CONTEXT':
      return 'MISSING_CONTEXT';
    default:
      return 'NOT_PERMITTED';
  }
}

const findRequest = (state: DemoState, id: string): ResourceRequest | undefined =>
  state.requests.find((r) => r.id === id);

const findAllocation = (state: DemoState, id: string): Allocation | undefined =>
  state.allocations.find((a) => a.id === id);

const replaceRequest = (state: DemoState, next: ResourceRequest): DemoState => ({
  ...state,
  requests: state.requests.map((r) => (r.id === next.id ? next : r)),
});

const replaceAllocation = (state: DemoState, next: Allocation): DemoState => ({
  ...state,
  allocations: state.allocations.map((a) => (a.id === next.id ? next : a)),
});

// --------------------------------------------------------------------------
// 1. Create a request
// --------------------------------------------------------------------------

export function createRequest(
  state: DemoState,
  actor: DemoUser,
  draft: RequestDraft,
  env: WorkflowEnv,
): WorkflowResult {
  const target = { action: 'request:create', targetType: 'REQUEST' as const, targetId: 'new' };

  const permission = can(actor, 'request:create');
  if (!permission.allowed) {
    return fail(state, env, actor, permissionCode(permission.code), permission.reason ?? 'Not permitted.', {
      ...target,
      summary: 'Attempted to create a request',
    });
  }

  const validation = validateRequestDraft(draft, state.pools);
  if (!validation.ok) {
    const first = validation.errors[0];
    return fail(
      state,
      env,
      actor,
      'VALIDATION_FAILED',
      first ? first.message : 'The request is not valid.',
      { ...target, summary: 'Attempted to create an invalid request' },
      validation.errors,
    );
  }

  const request: ResourceRequest = {
    id: env.nextId('req'),
    code: nextRequestCode(state.requests),
    title: draft.title.trim(),
    purpose: draft.purpose.trim(),
    requesterId: actor.id,
    items: draft.items.map((item) => ({ poolId: item.poolId, quantity: item.quantity })),
    durationDays: draft.durationDays,
    status: 'PENDING',
    createdAt: env.now(),
  };

  const next: DemoState = { ...state, requests: [...state.requests, request] };
  return succeed(next, env, actor, {
    action: 'request:create',
    targetType: 'REQUEST',
    targetId: request.id,
    summary: `Submitted ${request.code}`,
  });
}

// --------------------------------------------------------------------------
// 2. Approve / reject
// --------------------------------------------------------------------------

export type Decision = 'APPROVE' | 'REJECT';

export function decideRequest(
  state: DemoState,
  actor: DemoUser,
  requestId: string,
  decision: Decision,
  note: string | undefined,
  env: WorkflowEnv,
): WorkflowResult {
  const target = { action: 'request:decide', targetType: 'REQUEST' as const, targetId: requestId };
  const verb = decision === 'APPROVE' ? 'approve' : 'reject';

  // 1. entity
  const request = findRequest(state, requestId);
  if (!request) {
    return fail(state, env, actor, 'NOT_FOUND', 'That request no longer exists.', {
      ...target,
      summary: `Attempted to ${verb} a request that does not exist`,
    });
  }

  // 2. status
  const nextStatus: RequestStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  if (!canTransition(request.status, nextStatus)) {
    return fail(
      state,
      env,
      actor,
      'INVALID_STATE',
      `${request.code} is ${request.status.toLowerCase()} and can no longer be ${verb}ed.`,
      { ...target, summary: `Attempted to ${verb} ${request.code} out of turn` },
    );
  }

  // 3. permission (separation of duties lives here)
  const permission = can(actor, 'request:decide', { request });
  if (!permission.allowed) {
    return fail(state, env, actor, permissionCode(permission.code), permission.reason ?? 'Not permitted.', {
      ...target,
      summary: `Attempted to ${verb} ${request.code}`,
    });
  }

  const trimmedNote = (note ?? '').trim();
  if (decision === 'REJECT' && trimmedNote.length === 0) {
    return fail(
      state,
      env,
      actor,
      'VALIDATION_FAILED',
      'A reason is required when rejecting a request.',
      { ...target, summary: `Attempted to reject ${request.code} without a reason` },
      [{ field: 'decisionNote', message: 'A reason is required when rejecting a request.' }],
    );
  }

  const decided: ResourceRequest = {
    ...request,
    status: nextStatus,
    decidedAt: env.now(),
    decidedBy: actor.id,
    ...(trimmedNote.length > 0 ? { decisionNote: trimmedNote } : {}),
  };

  return succeed(replaceRequest(state, decided), env, actor, {
    action: 'request:decide',
    targetType: 'REQUEST',
    targetId: request.id,
    summary: `${decision === 'APPROVE' ? 'Approved' : 'Rejected'} ${request.code}`,
    ...(trimmedNote.length > 0 ? { reason: trimmedNote } : {}),
  });
}

// --------------------------------------------------------------------------
// 3. Cancel
// --------------------------------------------------------------------------

export function cancelRequest(
  state: DemoState,
  actor: DemoUser,
  requestId: string,
  reason: string | undefined,
  env: WorkflowEnv,
): WorkflowResult {
  const target = { action: 'request:cancel', targetType: 'REQUEST' as const, targetId: requestId };

  const request = findRequest(state, requestId);
  if (!request) {
    return fail(state, env, actor, 'NOT_FOUND', 'That request no longer exists.', {
      ...target,
      summary: 'Attempted to cancel a request that does not exist',
    });
  }

  if (!canTransition(request.status, 'CANCELLED')) {
    return fail(
      state,
      env,
      actor,
      'INVALID_STATE',
      `${request.code} is ${request.status.toLowerCase()} and can no longer be cancelled.`,
      { ...target, summary: `Attempted to cancel ${request.code} out of turn` },
    );
  }

  const permission = can(actor, 'request:cancel', { request });
  if (!permission.allowed) {
    return fail(state, env, actor, permissionCode(permission.code), permission.reason ?? 'Not permitted.', {
      ...target,
      summary: `Attempted to cancel ${request.code}`,
    });
  }

  const trimmed = (reason ?? '').trim();
  const cancelled: ResourceRequest = {
    ...request,
    status: 'CANCELLED',
    decidedAt: env.now(),
    decidedBy: actor.id,
    ...(trimmed.length > 0 ? { decisionNote: trimmed } : {}),
  };

  return succeed(replaceRequest(state, cancelled), env, actor, {
    action: 'request:cancel',
    targetType: 'REQUEST',
    targetId: request.id,
    summary: `Cancelled ${request.code}`,
    ...(trimmed.length > 0 ? { reason: trimmed } : {}),
  });
}

// --------------------------------------------------------------------------
// 4. Allocate
// --------------------------------------------------------------------------

export function allocateRequest(
  state: DemoState,
  actor: DemoUser,
  requestId: string,
  env: WorkflowEnv,
): WorkflowResult {
  const target = { action: 'allocation:create', targetType: 'REQUEST' as const, targetId: requestId };

  // 1. entity
  const request = findRequest(state, requestId);
  if (!request) {
    return fail(state, env, actor, 'NOT_FOUND', 'That request no longer exists.', {
      ...target,
      summary: 'Attempted to allocate for a request that does not exist',
    });
  }

  // 2. status
  if (!canTransition(request.status, 'ALLOCATED')) {
    return fail(
      state,
      env,
      actor,
      'INVALID_STATE',
      `${request.code} is ${request.status.toLowerCase()}; only an approved request can be allocated.`,
      { ...target, summary: `Attempted to allocate ${request.code} out of turn` },
    );
  }

  // 2b. double-allocation guard (belt and braces alongside the status check)
  const existing = state.allocations.find(
    (a) => a.requestId === request.id && a.status === 'ALLOCATED',
  );
  if (existing) {
    return fail(state, env, actor, 'DUPLICATE_ACTION', `${request.code} already has an active allocation.`, {
      ...target,
      summary: `Attempted to allocate ${request.code} twice`,
    });
  }

  // 3. permission
  const permission = can(actor, 'allocation:create', { request });
  if (!permission.allowed) {
    return fail(state, env, actor, permissionCode(permission.code), permission.reason ?? 'Not permitted.', {
      ...target,
      summary: `Attempted to allocate ${request.code}`,
    });
  }

  // 4. capacity, checked against live usage at the moment of writing
  const capacity = checkCapacity(state, request.items);
  if (!capacity.ok) {
    return fail(
      state,
      env,
      actor,
      'INSUFFICIENT_CAPACITY',
      capacity.reason ?? 'Not enough capacity.',
      { ...target, summary: `Attempted to allocate ${request.code} beyond available capacity` },
    );
  }

  const allocatedAt = env.now();
  const allocation: Allocation = {
    id: env.nextId('alloc'),
    requestId: request.id,
    items: request.items.map((item) => ({ ...item })),
    status: 'ALLOCATED',
    allocatedAt,
    allocatedBy: actor.id,
    expiresAt: addDays(allocatedAt, request.durationDays),
  };

  const next: DemoState = {
    ...replaceRequest(state, { ...request, status: 'ALLOCATED' }),
    allocations: [...state.allocations, allocation],
  };

  return succeed(next, env, actor, {
    action: 'allocation:create',
    targetType: 'ALLOCATION',
    targetId: allocation.id,
    summary: `Allocated resources for ${request.code}`,
  });
}

// --------------------------------------------------------------------------
// 5 & 6. Return and expire - one code path, two permissions
// --------------------------------------------------------------------------

function closeAllocation(
  state: DemoState,
  actor: DemoUser,
  allocationId: string,
  mode: 'RETURN' | 'EXPIRE',
  reason: string | undefined,
  env: WorkflowEnv,
): WorkflowResult {
  const action: Action = mode === 'RETURN' ? 'allocation:return' : 'allocation:expire';
  const verb = mode === 'RETURN' ? 'return' : 'expire';
  const target = { action, targetType: 'ALLOCATION' as const, targetId: allocationId };

  // 1. entity
  const allocation = findAllocation(state, allocationId);
  if (!allocation) {
    return fail(state, env, actor, 'NOT_FOUND', 'That allocation no longer exists.', {
      ...target,
      summary: `Attempted to ${verb} an allocation that does not exist`,
    });
  }

  const request = findRequest(state, allocation.requestId);
  if (!request) {
    return fail(state, env, actor, 'NOT_FOUND', 'The request behind this allocation is missing.', {
      ...target,
      summary: `Attempted to ${verb} an allocation with no matching request`,
    });
  }

  // 2. status - this is also what makes returning or expiring twice impossible
  if (allocation.status !== 'ALLOCATED') {
    return fail(
      state,
      env,
      actor,
      'INVALID_STATE',
      `This allocation was already ${allocation.status.toLowerCase()} and cannot be ${verb}ed again.`,
      { ...target, summary: `Attempted to ${verb} an allocation that is ${allocation.status.toLowerCase()}` },
    );
  }

  const nextRequestStatus: RequestStatus = mode === 'RETURN' ? 'RETURNED' : 'EXPIRED';
  if (!canTransition(request.status, nextRequestStatus)) {
    return fail(
      state,
      env,
      actor,
      'INVALID_STATE',
      `${request.code} is ${request.status.toLowerCase()} and cannot move to ${nextRequestStatus.toLowerCase()}.`,
      { ...target, summary: `Attempted an invalid transition on ${request.code}` },
    );
  }

  // 3. permission
  const permission = can(actor, action, { request, allocation });
  if (!permission.allowed) {
    return fail(state, env, actor, permissionCode(permission.code), permission.reason ?? 'Not permitted.', {
      ...target,
      summary: `Attempted to ${verb} the allocation for ${request.code}`,
    });
  }

  const trimmed = (reason ?? '').trim();
  if (mode === 'EXPIRE' && trimmed.length === 0) {
    return fail(
      state,
      env,
      actor,
      'VALIDATION_FAILED',
      'A reason is required when forcing an allocation to expire.',
      { ...target, summary: `Attempted to expire the allocation for ${request.code} without a reason` },
      [{ field: 'reason', message: 'A reason is required when forcing an allocation to expire.' }],
    );
  }

  // 4. apply. Capacity is derived from allocations, so closing this record is
  //    what returns the units to the pool - there is no separate counter to adjust.
  const closed: Allocation = {
    ...allocation,
    status: mode === 'RETURN' ? 'RETURNED' : 'EXPIRED',
    closedAt: env.now(),
    closedBy: actor.id,
  };

  const next: DemoState = replaceRequest(replaceAllocation(state, closed), {
    ...request,
    status: nextRequestStatus,
  });

  return succeed(next, env, actor, {
    action,
    targetType: 'ALLOCATION',
    targetId: allocation.id,
    summary:
      mode === 'RETURN'
        ? `Returned the allocation for ${request.code}`
        : `Expired the allocation for ${request.code}`,
    ...(trimmed.length > 0 ? { reason: trimmed } : {}),
  });
}

/** A requester returns their own allocation, or an administrator returns any. */
export function returnAllocation(
  state: DemoState,
  actor: DemoUser,
  allocationId: string,
  env: WorkflowEnv,
  reason?: string,
): WorkflowResult {
  return closeAllocation(state, actor, allocationId, 'RETURN', reason, env);
}

/**
 * Administrator-only forced expiry. Nothing expires on a timer: an allocation
 * past its expiry date is shown as overdue (see `format.isOverdue`) and stays
 * ALLOCATED until a person acts.
 */
export function expireAllocation(
  state: DemoState,
  actor: DemoUser,
  allocationId: string,
  reason: string,
  env: WorkflowEnv,
): WorkflowResult {
  return closeAllocation(state, actor, allocationId, 'EXPIRE', reason, env);
}

// --------------------------------------------------------------------------
// 7. Reset the demo back to its seed data
// --------------------------------------------------------------------------

/**
 * Administrator-only. The reset is itself an auditable action: the entry is
 * written into the FRESH log so there is always evidence that the previous
 * history was replaced, rather than the reset vanishing along with it.
 */
export function resetDemoData(state: DemoState, actor: DemoUser, env: WorkflowEnv): WorkflowResult {
  const target = { action: 'demo:reset', targetType: 'DEMO' as const, targetId: 'demo-state' };

  const permission = can(actor, 'demo:reset');
  if (!permission.allowed) {
    return fail(state, env, actor, permissionCode(permission.code), permission.reason ?? 'Not permitted.', {
      ...target,
      summary: 'Attempted to reset the demo data',
    });
  }

  const seeded: DemoState = { ...createSeedState(), activeUserId: actor.id };
  return succeed(seeded, env, actor, {
    ...target,
    summary: 'Reset the demo data to its default state',
  });
}
