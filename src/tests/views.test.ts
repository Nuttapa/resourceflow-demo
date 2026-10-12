import { describe, expect, it } from 'vitest';
import { allocationForRequest, cancellable, hiddenRequestCount, requesterName, visibleRequests } from '@/lib/views';
import { can } from '@/lib/permissions';
import { applyAction } from '@/lib/dispatch';
import { freshState, request, testEnv, user } from './helpers';

describe('visibleRequests - what each role may list', () => {
  it('shows a requester only their own requests', () => {
    const state = freshState();
    const rows = visibleRequests(state, user(state, 'u-aree'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.requesterId === 'u-aree')).toBe(true);
    expect(rows.map((r) => r.id)).not.toContain('req-1003');
  });

  it('shows an approver their own requests plus everything still pending', () => {
    const state = freshState();
    const rows = visibleRequests(state, user(state, 'u-sunee'));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('req-1005'); // their own
    expect(ids).toContain('req-1003'); // pending, awaiting a decision
    expect(ids).not.toContain('req-1001'); // allocated and not theirs
    expect(ids).not.toContain('req-1006'); // already rejected and not theirs
  });

  it('shows an administrator every request', () => {
    const state = freshState();
    expect(visibleRequests(state, user(state, 'u-admin')).length).toBe(state.requests.length);
    expect(hiddenRequestCount(state, user(state, 'u-admin'))).toBe(0);
  });

  it('counts what each persona cannot see', () => {
    const state = freshState();
    for (const id of ['u-aree', 'u-pradit', 'u-kittipong']) {
      const actor = user(state, id);
      expect(visibleRequests(state, actor).length + hiddenRequestCount(state, actor)).toBe(
        state.requests.length,
      );
      expect(hiddenRequestCount(state, actor)).toBeGreaterThan(0);
    }
  });

  it('never lists a request the detail rule would refuse', () => {
    const state = freshState();
    for (const id of ['u-aree', 'u-kittipong', 'u-nicha', 'u-pradit', 'u-sunee', 'u-admin']) {
      const actor = user(state, id);
      for (const row of visibleRequests(state, actor)) {
        expect(can(actor, 'request:viewOne', { request: row }).allowed).toBe(true);
      }
    }
  });

  it('sorts newest first', () => {
    const state = freshState();
    const rows = visibleRequests(state, user(state, 'u-admin'));
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.createdAt >= rows[i]!.createdAt).toBe(true);
    }
  });

  it('includes a newly created request for its author straight away', () => {
    const state = freshState();
    const actor = user(state, 'u-nicha');
    const before = visibleRequests(state, actor).length;
    const result = applyAction(
      state,
      actor,
      {
        type: 'request:create',
        draft: {
          title: 'Fresh request',
          purpose: 'Check the list picks it up immediately.',
          items: [{ poolId: 'pool-cpu', quantity: 1 }],
          durationDays: 3,
        },
      },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(visibleRequests(result.state, actor).length).toBe(before + 1);
  });
});

describe('cancellable - when the Cancel control is offered', () => {
  it('is offered to the owner of a pending request', () => {
    const state = freshState();
    expect(cancellable(user(state, 'u-kittipong'), request(state, 'req-1003'))).toBe(true);
  });

  it('is offered to an administrator', () => {
    const state = freshState();
    expect(cancellable(user(state, 'u-admin'), request(state, 'req-1003'))).toBe(true);
  });

  it('is not offered to another requester or to an approver who does not own it', () => {
    const state = freshState();
    expect(cancellable(user(state, 'u-aree'), request(state, 'req-1003'))).toBe(false);
    expect(cancellable(user(state, 'u-pradit'), request(state, 'req-1003'))).toBe(false);
  });

  it('is not offered once the request has left PENDING', () => {
    const state = freshState();
    for (const id of ['req-1001', 'req-1006', 'req-1007']) {
      expect(cancellable(user(state, 'u-admin'), request(state, id))).toBe(false);
    }
  });
});

describe('small helpers', () => {
  it('resolves a requester name and degrades safely', () => {
    const state = freshState();
    expect(requesterName(state, 'u-aree')).toBe('Aree Boonmee');
    expect(requesterName(state, 'u-ghost')).toBe('Unknown user');
    expect(requesterName(state, '')).toBe('Unknown user');
  });

  it('finds the allocation behind a request, or nothing', () => {
    const state = freshState();
    expect(allocationForRequest(state, 'req-1001')?.id).toBe('alloc-2001');
    expect(allocationForRequest(state, 'req-1003')).toBeUndefined();
  });
});
