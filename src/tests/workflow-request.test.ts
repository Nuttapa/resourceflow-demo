import { describe, expect, it } from 'vitest';
import { createRequest, cancelRequest } from '@/lib/workflow';
import { validateRequestDraft } from '@/lib/validation';
import { capacityViolations } from '@/lib/capacity';
import { businessData, expectRefusedCleanly, freshState, request, testEnv, user } from './helpers';
import type { RequestDraft } from '@/lib/validation';

const validDraft: RequestDraft = {
  title: 'Course project API server',
  purpose: 'Run the team API for the integration sprint.',
  items: [
    { poolId: 'pool-cpu', quantity: 4 },
    { poolId: 'pool-mem', quantity: 8 },
  ],
  durationDays: 14,
};

describe('createRequest - happy path', () => {
  it('adds a PENDING request owned by the actor, with one audit entry', () => {
    const state = freshState();
    const actor = user(state, 'u-aree');
    const result = createRequest(state, actor, validDraft, testEnv());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.requests.length).toBe(state.requests.length + 1);
    const created = result.state.requests[result.state.requests.length - 1]!;
    expect(created.status).toBe('PENDING');
    expect(created.requesterId).toBe('u-aree');
    expect(created.code).toBe('RF-1008');
    expect(created.id).toBe('req-test-1');
    expect(created.createdAt).toBe('2026-10-12T00:00:00.000Z');

    expect(result.state.auditLog.length).toBe(state.auditLog.length + 1);
    expect(result.audit.outcome).toBe('ALLOWED');
    expect(result.audit.actorId).toBe('u-aree');
    expect(result.audit.actorName).toBe(actor.name);
    expect(result.audit.actorRole).toBe('REQUESTER');
    expect(result.audit.action).toBe('request:create');
  });

  it('does not mutate the state it was given', () => {
    const state = freshState();
    const before = structuredClone(businessData(state));
    createRequest(state, user(state, 'u-aree'), validDraft, testEnv());
    expect(businessData(state)).toEqual(before);
  });

  it('trims whitespace and creates no allocation', () => {
    const state = freshState();
    const result = createRequest(
      state,
      user(state, 'u-nicha'),
      { ...validDraft, title: '  Padded title  ', purpose: '  A perfectly good reason.  ' },
      testEnv(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.state.requests[result.state.requests.length - 1]!;
    expect(created.title).toBe('Padded title');
    expect(created.purpose).toBe('A perfectly good reason.');
    expect(result.state.allocations.length).toBe(state.allocations.length);
  });

  it('any role may file a request on their own behalf', () => {
    for (const id of ['u-aree', 'u-pradit', 'u-admin']) {
      const state = freshState();
      expect(createRequest(state, user(state, id), validDraft, testEnv()).ok).toBe(true);
    }
  });
});

describe('createRequest - validation refuses bad input', () => {
  const cases: { name: string; draft: RequestDraft }[] = [
    { name: 'missing title', draft: { ...validDraft, title: '   ' } },
    { name: 'missing purpose', draft: { ...validDraft, purpose: '' } },
    { name: 'purpose too short', draft: { ...validDraft, purpose: 'nope' } },
    { name: 'no resources', draft: { ...validDraft, items: [] } },
    { name: 'zero quantity', draft: { ...validDraft, items: [{ poolId: 'pool-cpu', quantity: 0 }] } },
    { name: 'negative quantity', draft: { ...validDraft, items: [{ poolId: 'pool-cpu', quantity: -5 }] } },
    { name: 'fractional quantity', draft: { ...validDraft, items: [{ poolId: 'pool-cpu', quantity: 1.5 }] } },
    { name: 'NaN quantity', draft: { ...validDraft, items: [{ poolId: 'pool-cpu', quantity: Number.NaN }] } },
    { name: 'unknown pool', draft: { ...validDraft, items: [{ poolId: 'pool-quantum', quantity: 1 }] } },
    {
      name: 'duplicate pool',
      draft: {
        ...validDraft,
        items: [
          { poolId: 'pool-cpu', quantity: 2 },
          { poolId: 'pool-cpu', quantity: 2 },
        ],
      },
    },
    { name: 'more than the cluster owns', draft: { ...validDraft, items: [{ poolId: 'pool-gpu', quantity: 99 }] } },
    { name: 'zero duration', draft: { ...validDraft, durationDays: 0 } },
    { name: 'negative duration', draft: { ...validDraft, durationDays: -3 } },
    { name: 'fractional duration', draft: { ...validDraft, durationDays: 2.5 } },
    { name: 'duration beyond the cap', draft: { ...validDraft, durationDays: 400 } },
  ];

  for (const { name, draft } of cases) {
    it(`refuses: ${name}`, () => {
      const state = freshState();
      const result = createRequest(state, user(state, 'u-aree'), draft, testEnv());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.reason.length).toBeGreaterThan(5);
      expectRefusedCleanly(state, result.state);
    });
  }

  it('accepts a draft that sits exactly on the limits', () => {
    const state = freshState();
    const outcome = validateRequestDraft(
      { ...validDraft, durationDays: 365, items: [{ poolId: 'pool-gpu', quantity: 6 }] },
      state.pools,
    );
    expect(outcome.ok).toBe(true);
  });
});

describe('cancelRequest', () => {
  it('lets the owner cancel their own PENDING request', () => {
    const state = freshState();
    const result = cancelRequest(state, user(state, 'u-kittipong'), 'req-1003', 'Not needed any more', testEnv());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(request(result.state, 'req-1003').status).toBe('CANCELLED');
    expect(request(result.state, 'req-1003').decidedBy).toBe('u-kittipong');
    expect(result.audit.action).toBe('request:cancel');
    expect(capacityViolations(result.state)).toEqual([]);
  });

  it('lets an administrator cancel someone else PENDING request', () => {
    const state = freshState();
    const result = cancelRequest(state, user(state, 'u-admin'), 'req-1003', undefined, testEnv());
    expect(result.ok).toBe(true);
  });

  it('refuses a requester cancelling another person request', () => {
    const state = freshState();
    const result = cancelRequest(state, user(state, 'u-aree'), 'req-1003', undefined, testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_OWNER');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses an approver cancelling a request they do not own', () => {
    const state = freshState();
    const result = cancelRequest(state, user(state, 'u-pradit'), 'req-1003', undefined, testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_OWNER');
    expectRefusedCleanly(state, result.state);
  });

  it('refuses cancelling a request that is no longer pending', () => {
    for (const id of ['req-1001', 'req-1006', 'req-1007']) {
      const state = freshState();
      const result = cancelRequest(state, user(state, 'u-admin'), id, undefined, testEnv());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('INVALID_STATE');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('refuses cancelling twice', () => {
    const state = freshState();
    const first = cancelRequest(state, user(state, 'u-kittipong'), 'req-1003', undefined, testEnv());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = cancelRequest(first.state, user(state, 'u-kittipong'), 'req-1003', undefined, testEnv());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('INVALID_STATE');
    expectRefusedCleanly(first.state, second.state);
  });

  it('refuses an unknown request id', () => {
    const state = freshState();
    const result = cancelRequest(state, user(state, 'u-admin'), 'req-nope', undefined, testEnv());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_FOUND');
    expectRefusedCleanly(state, result.state);
  });
});
