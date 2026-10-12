import { describe, expect, it } from 'vitest';
import { applyAction, type WorkflowAction } from '@/lib/dispatch';
import { createSeedState } from '@/lib/seed';
import { capacityViolations } from '@/lib/capacity';
import { allocation, available, expectRefusedCleanly, freshState, request, testEnv, user } from './helpers';
import type { DemoState } from '@/lib/types';

const draft = {
  title: 'Dispatch fixture',
  purpose: 'Exercise the dispatch layer end to end.',
  items: [{ poolId: 'pool-cpu', quantity: 2 }],
  durationDays: 7,
};

describe('applyAction routes to the right rule', () => {
  it('request:create adds a pending request owned by the actor', () => {
    const state = freshState();
    const result = applyAction(state, user(state, 'u-aree'), { type: 'request:create', draft }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.state.requests[result.state.requests.length - 1]!;
    expect(created.status).toBe('PENDING');
    expect(created.requesterId).toBe('u-aree');
    expect(result.audit.action).toBe('request:create');
  });

  it('request:decide approves', () => {
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
  });

  it('request:decide rejects with a reason', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'REJECT', note: 'Out of scope' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').status).toBe('REJECTED');
    expect(request(result.state, 'req-1003').decisionNote).toBe('Out of scope');
  });

  it('request:cancel cancels the owner own pending request', () => {
    const state = freshState();
    const result = applyAction(
      state,
      user(state, 'u-kittipong'),
      { type: 'request:cancel', requestId: 'req-1003' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').status).toBe('CANCELLED');
  });

  it('allocation:return returns an allocation and frees capacity', () => {
    const state = freshState();
    const before = available(state, 'pool-cpu');
    const result = applyAction(
      state,
      user(state, 'u-aree'),
      { type: 'allocation:return', allocationId: 'alloc-2001' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(allocation(result.state, 'alloc-2001').status).toBe('RETURNED');
    expect(available(result.state, 'pool-cpu')).toBe(before + 4);
  });

  it('allocation:expire is administrator-only and needs a reason', () => {
    const state = freshState();
    const ok = applyAction(
      state,
      user(state, 'u-admin'),
      { type: 'allocation:expire', allocationId: 'alloc-2001', reason: 'Term ended' },
      testEnv(),
    );
    expect(ok.ok).toBe(true);

    const denied = applyAction(
      state,
      user(state, 'u-aree'),
      { type: 'allocation:expire', allocationId: 'alloc-2001', reason: 'Term ended' },
      testEnv(),
    );
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.code).toBe('NOT_PERMITTED');
    expectRefusedCleanly(state, denied.state);
  });
});

describe('allocation:create through dispatch', () => {
  it('allocates an approved request as an administrator', () => {
    const state = freshState();
    const approved = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    const result = applyAction(
      approved.state,
      user(state, 'u-admin'),
      { type: 'allocation:create', requestId: 'req-1003' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').status).toBe('ALLOCATED');
    expect(capacityViolations(result.state)).toEqual([]);
  });
});

describe('demo:reset', () => {
  it('restores the seed data for an administrator and records the reset', () => {
    const state = freshState();
    const dirty = applyAction(state, user(state, 'u-aree'), { type: 'request:create', draft }, testEnv());
    expect(dirty.ok).toBe(true);
    if (!dirty.ok) return;

    const result = applyAction(dirty.state, user(state, 'u-admin'), { type: 'demo:reset' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const seed = createSeedState();
    expect(result.state.requests).toEqual(seed.requests);
    expect(result.state.allocations).toEqual(seed.allocations);
    expect(result.state.pools).toEqual(seed.pools);
    expect(result.state.activeUserId).toBe('u-admin');

    // the reset itself survives in the fresh log
    expect(result.state.auditLog.length).toBe(seed.auditLog.length + 1);
    const last = result.state.auditLog[result.state.auditLog.length - 1]!;
    expect(last.action).toBe('demo:reset');
    expect(last.outcome).toBe('ALLOWED');
    expect(last.actorId).toBe('u-admin');
  });

  it('refuses a requester and an approver, changing nothing', () => {
    for (const id of ['u-aree', 'u-pradit']) {
      const state = freshState();
      const result = applyAction(state, user(state, id), { type: 'demo:reset' }, testEnv());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('NOT_PERMITTED');
      expectRefusedCleanly(state, result.state);
    }
  });
});

describe('sequential dispatches never work from stale state', () => {
  it('chains three actions, each starting from the previous result', () => {
    const start = freshState();
    const env = testEnv();
    let state: DemoState = start;

    const actions: WorkflowAction[] = [
      { type: 'request:create', draft },
      { type: 'request:decide', requestId: '', decision: 'APPROVE' },
      { type: 'allocation:create', requestId: '' },
    ];

    // 1. create
    const created = applyAction(state, user(start, 'u-aree'), actions[0]!, env);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    state = created.state;
    const newId = state.requests[state.requests.length - 1]!.id;

    // 2. approve, starting from the state the previous action produced
    const approved = applyAction(
      state,
      user(start, 'u-pradit'),
      { type: 'request:decide', requestId: newId, decision: 'APPROVE' },
      env,
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    state = approved.state;

    // 3. allocate
    const allocated = applyAction(state, user(start, 'u-admin'), { type: 'allocation:create', requestId: newId }, env);
    expect(allocated.ok).toBe(true);
    if (!allocated.ok) return;
    state = allocated.state;

    expect(request(state, newId).status).toBe('ALLOCATED');
    expect(state.auditLog.length).toBe(start.auditLog.length + 3);
    expect(capacityViolations(state)).toEqual([]);
  });

  it('applying the same action twice to the SAME old state is refused the second time when chained', () => {
    const start = freshState();
    const env = testEnv();
    const first = applyAction(
      start,
      user(start, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      env,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Chained correctly (what the provider does via its ref): refused.
    const chained = applyAction(
      first.state,
      user(start, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      env,
    );
    expect(chained.ok).toBe(false);
    if (chained.ok) return;
    expect(chained.code).toBe('INVALID_STATE');
  });
});
