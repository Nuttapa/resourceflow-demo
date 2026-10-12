import { describe, expect, it } from 'vitest';
import { ALLOWED_REQUEST_TRANSITIONS, canTransition, decideRequest } from '@/lib/workflow';
import { REQUEST_STATUSES, type RequestStatus } from '@/lib/types';
import { expectRefusedCleanly, freshState, request, testEnv, user } from './helpers';

describe('approve', () => {
  it('lets an uninvolved approver approve a pending request', () => {
    const state = freshState();
    const result = decideRequest(state, user(state, 'u-pradit'), 'req-1003', 'APPROVE', 'Looks fine', testEnv());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decided = request(result.state, 'req-1003');
    expect(decided.status).toBe('APPROVED');
    expect(decided.decidedBy).toBe('u-pradit');
    expect(decided.decidedAt).toBe('2026-10-12T00:00:00.000Z');
    expect(decided.decisionNote).toBe('Looks fine');
    expect(result.audit.outcome).toBe('ALLOWED');
    expect(result.audit.actorRole).toBe('APPROVER');
  });

  it('lets an administrator approve a request they did not file', () => {
    const state = freshState();
    expect(decideRequest(state, user(state, 'u-admin'), 'req-1003', 'APPROVE', undefined, testEnv()).ok).toBe(true);
  });

  it('approving without a note is allowed and leaves no note', () => {
    const state = freshState();
    const result = decideRequest(state, user(state, 'u-pradit'), 'req-1003', 'APPROVE', '   ', testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').decisionNote).toBeUndefined();
  });

  it('creates no allocation and changes no capacity', () => {
    const state = freshState();
    const result = decideRequest(state, user(state, 'u-pradit'), 'req-1003', 'APPROVE', undefined, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.allocations).toEqual(state.allocations);
    expect(result.state.pools).toEqual(state.pools);
  });
});

describe('reject', () => {
  it('requires a reason', () => {
    const state = freshState();
    const result = decideRequest(state, user(state, 'u-pradit'), 'req-1003', 'REJECT', '   ', testEnv());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.errors?.[0]?.field).toBe('decisionNote');
    expectRefusedCleanly(state, result.state);
  });

  it('records the reason on the request and in the audit entry', () => {
    const state = freshState();
    const result = decideRequest(
      state,
      user(state, 'u-pradit'),
      'req-1003',
      'REJECT',
      'Capacity is reserved for exams that week.',
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').status).toBe('REJECTED');
    expect(request(result.state, 'req-1003').decisionNote).toBe('Capacity is reserved for exams that week.');
    expect(result.audit.reason).toBe('Capacity is reserved for exams that week.');
  });
});

describe('separation of duties', () => {
  it('refuses an approver deciding a request they filed themselves', () => {
    const state = freshState();
    // u-sunee is an APPROVER and filed req-1005.
    const result = decideRequest(state, user(state, 'u-sunee'), 'req-1005', 'APPROVE', undefined, testEnv());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SELF_APPROVAL');
    expect(result.reason).toContain('yourself');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses self-rejection as well as self-approval', () => {
    const state = freshState();
    const result = decideRequest(state, user(state, 'u-sunee'), 'req-1005', 'REJECT', 'changed my mind', testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SELF_APPROVAL');
  });

  it('refuses an administrator deciding their own request', () => {
    const state = freshState();
    const admin = user(state, 'u-admin');
    const own = { ...request(state, 'req-1003'), requesterId: admin.id };
    const patched = { ...state, requests: state.requests.map((r) => (r.id === own.id ? own : r)) };

    const result = decideRequest(patched, admin, 'req-1003', 'APPROVE', undefined, testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SELF_APPROVAL');
    expectRefusedCleanly(patched, result.state);
  });

  it('refuses a requester deciding anything', () => {
    const state = freshState();
    const result = decideRequest(state, user(state, 'u-aree'), 'req-1003', 'APPROVE', undefined, testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, result.state);
  });
});

describe('duplicate and out-of-turn decisions', () => {
  it('refuses deciding the same request twice', () => {
    const state = freshState();
    const first = decideRequest(state, user(state, 'u-pradit'), 'req-1003', 'APPROVE', undefined, testEnv());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = decideRequest(first.state, user(state, 'u-pradit'), 'req-1003', 'REJECT', 'oops', testEnv());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('INVALID_STATE');
    expectRefusedCleanly(first.state, second.state);
  });

  it('refuses deciding a request that was already rejected, cancelled, allocated or returned', () => {
    for (const id of ['req-1006', 'req-1001', 'req-1007']) {
      const state = freshState();
      const result = decideRequest(state, user(state, 'u-pradit'), id, 'APPROVE', undefined, testEnv());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('INVALID_STATE');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('refuses an unknown request id', () => {
    const state = freshState();
    const result = decideRequest(state, user(state, 'u-pradit'), 'req-ghost', 'APPROVE', undefined, testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_FOUND');
    expectRefusedCleanly(state, result.state);
  });
});

describe('transition table', () => {
  const expected: Record<RequestStatus, RequestStatus[]> = {
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['ALLOCATED'],
    ALLOCATED: ['RETURNED', 'EXPIRED'],
    REJECTED: [],
    CANCELLED: [],
    RETURNED: [],
    EXPIRED: [],
  };

  it('matches the agreed state machine exactly', () => {
    expect(ALLOWED_REQUEST_TRANSITIONS).toEqual(expected);
  });

  it('allows only the listed pairs and nothing else', () => {
    for (const from of REQUEST_STATUSES) {
      for (const to of REQUEST_STATUSES) {
        expect(canTransition(from, to)).toBe(expected[from].includes(to));
      }
    }
  });

  it('never allows a request to return to PENDING', () => {
    for (const from of REQUEST_STATUSES) {
      expect(canTransition(from, 'PENDING')).toBe(false);
    }
  });
});
