import { describe, expect, it } from 'vitest';
import { decidableRows, isReviewer, poolsInRequests, reviewQueue } from '@/lib/views';
import { applyAction } from '@/lib/dispatch';
import { describeOutcome } from '@/lib/notify';
import { capacityViolations, computeUsage } from '@/lib/capacity';
import { expectRefusedCleanly, freshState, request, testEnv, user } from './helpers';

describe('reviewQueue - what the approval screen lists', () => {
  it('lists only PENDING requests', () => {
    const state = freshState();
    const rows = reviewQueue(state, user(state, 'u-admin'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.request.status === 'PENDING')).toBe(true);
    expect(rows.map((r) => r.request.id)).not.toContain('req-1001'); // allocated
    expect(rows.map((r) => r.request.id)).not.toContain('req-1006'); // rejected
  });

  it('gives an administrator every pending request', () => {
    const state = freshState();
    const pending = state.requests.filter((r) => r.status === 'PENDING').length;
    expect(reviewQueue(state, user(state, 'u-admin')).length).toBe(pending);
  });

  it('keeps an approver own pending request in the list but marks it undecidable', () => {
    const state = freshState();
    const rows = reviewQueue(state, user(state, 'u-sunee'));
    const own = rows.find((row) => row.request.id === 'req-1005');
    expect(own).toBeDefined();
    expect(own!.decision.allowed).toBe(false);
    expect(own!.decision.code).toBe('SELF_APPROVAL');
    expect(own!.decision.reason).toContain('yourself');
  });

  it('separates the rows that can actually be acted on', () => {
    const state = freshState();
    const rows = reviewQueue(state, user(state, 'u-sunee'));
    const actionable = decidableRows(rows);
    expect(actionable.length).toBe(rows.length - 1);
    expect(actionable.every((row) => row.decision.allowed)).toBe(true);
    expect(actionable.map((r) => r.request.id)).not.toContain('req-1005');
  });

  it('is empty for a requester, who also is not a reviewer', () => {
    const state = freshState();
    for (const id of ['u-aree', 'u-kittipong', 'u-nicha']) {
      const actor = user(state, id);
      expect(isReviewer(state, actor)).toBe(false);
      expect(decidableRows(reviewQueue(state, actor))).toEqual([]);
    }
  });

  it('treats approvers and administrators as reviewers', () => {
    const state = freshState();
    expect(isReviewer(state, user(state, 'u-pradit'))).toBe(true);
    expect(isReviewer(state, user(state, 'u-sunee'))).toBe(true);
    expect(isReviewer(state, user(state, 'u-admin'))).toBe(true);
  });

  it('sorts oldest first so the longest wait is handled first', () => {
    const state = freshState();
    const rows = reviewQueue(state, user(state, 'u-admin'));
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.request.createdAt <= rows[i]!.request.createdAt).toBe(true);
    }
  });

  it('offers a resource filter built only from pools actually in the queue', () => {
    const state = freshState();
    const rows = reviewQueue(state, user(state, 'u-admin'));
    const pools = poolsInRequests(state, rows.map((r) => r.request));
    const used = new Set(rows.flatMap((r) => r.request.items.map((i) => i.poolId)));
    expect(pools.length).toBe(used.size);
    expect(pools.every((p) => used.has(p.id))).toBe(true);
  });

  it('shrinks as soon as a request is decided', () => {
    const state = freshState();
    const before = reviewQueue(state, user(state, 'u-pradit')).length;
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(reviewQueue(result.state, user(state, 'u-pradit')).length).toBe(before - 1);
  });
});

describe('deciding from the queue', () => {
  it('approves and records an allowed audit entry naming the actor', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').status).toBe('APPROVED');
    expect(result.audit.outcome).toBe('ALLOWED');
    expect(result.audit.actorId).toBe('u-pradit');
    expect(result.audit.actorRole).toBe('APPROVER');
    expect(describeOutcome(result, true, 'READY').tone).toBe('success');
  });

  it('rejects with a reason and keeps it on the request and the audit entry', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'REJECT', note: 'Lab is reserved that week.' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').status).toBe('REJECTED');
    expect(request(result.state, 'req-1003').decisionNote).toBe('Lab is reserved that week.');
    expect(result.audit.reason).toBe('Lab is reserved that week.');
  });

  it('refuses a rejection whose reason is only whitespace', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'REJECT', note: '   \n  ' },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.errors?.[0]?.field).toBe('decisionNote');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses self-approval for an approver', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-sunee'),
      { type: 'request:decide', requestId: 'req-1005', decision: 'APPROVE' },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SELF_APPROVAL');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses a requester who reaches the action some other way', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-aree'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses a request that is no longer pending', () => {
    const state = freshState();
    for (const id of ['req-1001', 'req-1006', 'req-1007']) {
      const result = applyAction(
        state,
        user(state, 'u-pradit'),
        { type: 'request:decide', requestId: id, decision: 'APPROVE' },
        testEnv(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('INVALID_STATE');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('refuses a second decision on the same request', () => {
    const state = freshState();
    const first = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyAction(
      first.state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('INVALID_STATE');
    expectRefusedCleanly(first.state, second.state);
  });
});

describe('approving never touches capacity', () => {
  it('creates no allocation and leaves every pool unchanged', () => {
    const state = freshState();
    const before = computeUsage(state);
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.allocations).toEqual(state.allocations);
    expect(computeUsage(result.state)).toEqual(before);
    expect(capacityViolations(result.state)).toEqual([]);
  });
});

describe('the screen never reports a save it did not get', () => {
  it('shows a warning, not a success, when an approval cannot be persisted', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    for (const persistence of ['READY', 'READ_ONLY', 'UNAVAILABLE'] as const) {
      expect(describeOutcome(result, false, persistence).tone).toBe('warning');
      expect(describeOutcome(result, false, persistence).title).toContain('not saved');
    }
  });

  it('shows an error for a refused decision in every persistence state', () => {
    const state = freshState();
    const refused = applyAction(
      state,
      user(state, 'u-sunee'),
      { type: 'request:decide', requestId: 'req-1005', decision: 'APPROVE' },
      testEnv(),
    );
    for (const persistence of ['READY', 'READ_ONLY', 'UNAVAILABLE'] as const) {
      for (const persisted of [true, false]) {
        expect(describeOutcome(refused, persisted, persistence).tone).toBe('error');
      }
    }
  });
});
