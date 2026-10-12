import type { Allocation, DemoUser, ResourceRequest, Role } from './types';

export const ACTIONS = [
  'request:create',
  'request:viewAll',
  'request:viewOne',
  'request:cancel',
  'request:decide',
  'allocation:create',
  'allocation:return',
  'allocation:expire',
  'capacity:manage',
  'demo:reset',
] as const;
export type Action = (typeof ACTIONS)[number];

export interface PermissionContext {
  request?: ResourceRequest;
  allocation?: Allocation;
}

export interface PermissionResult {
  allowed: boolean;
  /** Machine-readable denial code; absent when allowed. */
  code?: 'NOT_PERMITTED' | 'NOT_OWNER' | 'SELF_APPROVAL' | 'MISSING_CONTEXT';
  /** Human-readable message shown in the UI when an action is refused. */
  reason?: string;
}

const ALLOW: PermissionResult = { allowed: true };

function deny(code: NonNullable<PermissionResult['code']>, reason: string): PermissionResult {
  return { allowed: false, code, reason };
}

function isOwner(actor: DemoUser, request: ResourceRequest | undefined): boolean {
  return !!request && request.requesterId === actor.id;
}

/**
 * Single source of truth for role permissions.
 *
 * This is deliberately a pure function with no React and no DOM: the workflow
 * layer calls it before every state change, so a permission cannot be bypassed
 * by reaching a screen directly or by re-enabling a disabled button.
 *
 * NOTE: these are frontend-only demo checks. They illustrate authorization
 * modelling; they are not production security and there is no server to enforce them.
 */
export function can(actor: DemoUser, action: Action, ctx: PermissionContext = {}): PermissionResult {
  const role: Role = actor.role;

  switch (action) {
    case 'request:create':
      // Every demo persona may file a request on their own behalf.
      return ALLOW;

    case 'request:viewAll':
      return role === 'ADMIN'
        ? ALLOW
        : deny('NOT_PERMITTED', 'Only an Administrator can browse every request in the demo.');

    case 'request:viewOne': {
      const request = ctx.request;
      if (!request) return deny('MISSING_CONTEXT', 'No request was supplied.');
      if (role === 'ADMIN') return ALLOW;
      if (isOwner(actor, request)) return ALLOW;
      if (role === 'APPROVER' && request.status === 'PENDING') return ALLOW;
      return deny('NOT_OWNER', 'Requesters can only open their own requests.');
    }

    case 'request:cancel': {
      const request = ctx.request;
      if (!request) return deny('MISSING_CONTEXT', 'No request was supplied.');
      if (isOwner(actor, request) || role === 'ADMIN') return ALLOW;
      return deny('NOT_OWNER', 'Only the requester who filed this request, or an Administrator, can cancel it.');
    }

    case 'request:decide': {
      const request = ctx.request;
      if (!request) return deny('MISSING_CONTEXT', 'No request was supplied.');
      if (role !== 'APPROVER' && role !== 'ADMIN') {
        return deny('NOT_PERMITTED', 'Only an Approver or an Administrator can approve or reject a request.');
      }
      // Separation of duties: holding the Approver role does not let you clear your own request.
      if (isOwner(actor, request)) {
        return deny('SELF_APPROVAL', 'You cannot approve or reject a request that you filed yourself.');
      }
      return ALLOW;
    }

    case 'allocation:create':
      return role === 'ADMIN'
        ? ALLOW
        : deny('NOT_PERMITTED', 'Only an Administrator can allocate resources from the pool.');

    case 'allocation:return': {
      const request = ctx.request;
      if (role === 'ADMIN') return ALLOW;
      if (role === 'APPROVER' && !isOwner(actor, request)) {
        return deny('NOT_PERMITTED', 'Approvers do not manage allocations; ask an Administrator.');
      }
      if (!request) return deny('MISSING_CONTEXT', 'No request was supplied.');
      if (isOwner(actor, request)) return ALLOW;
      return deny('NOT_OWNER', 'You can only return an allocation that belongs to your own request.');
    }

    case 'allocation:expire':
      return role === 'ADMIN'
        ? ALLOW
        : deny('NOT_PERMITTED', 'Only an Administrator can force an allocation to expire.');

    case 'capacity:manage':
      return role === 'ADMIN'
        ? ALLOW
        : deny('NOT_PERMITTED', 'Only an Administrator can change simulated pool capacity.');

    case 'demo:reset':
      return role === 'ADMIN'
        ? ALLOW
        : deny('NOT_PERMITTED', 'Only an Administrator can reset the demo data.');

    default: {
      const exhaustive: never = action;
      return deny('NOT_PERMITTED', `Unknown action: ${String(exhaustive)}`);
    }
  }
}

/** Convenience wrapper for rendering the permission matrix screen. */
export function describeMatrix(): { action: Action; label: string }[] {
  return [
    { action: 'request:create', label: 'Create a resource request' },
    { action: 'request:viewAll', label: 'Browse every request' },
    { action: 'request:decide', label: 'Approve / reject a request' },
    { action: 'request:cancel', label: 'Cancel a request' },
    { action: 'allocation:create', label: 'Allocate resources' },
    { action: 'allocation:return', label: 'Return an allocation' },
    { action: 'allocation:expire', label: 'Force-expire an allocation' },
    { action: 'capacity:manage', label: 'Manage pool capacity' },
    { action: 'demo:reset', label: 'Reset demo data' },
  ];
}
