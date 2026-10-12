import { describe, expect, it } from 'vitest';
import { can } from '@/lib/permissions';
import { createSeedState } from '@/lib/seed';
import type { DemoUser, ResourceRequest } from '@/lib/types';

const state = createSeedState();
const user = (id: string): DemoUser => {
  const found = state.users.find((u) => u.id === id);
  if (!found) throw new Error(`seed user ${id} missing`);
  return found;
};
const request = (id: string): ResourceRequest => {
  const found = state.requests.find((r) => r.id === id);
  if (!found) throw new Error(`seed request ${id} missing`);
  return found;
};

const requester = user('u-aree');
const otherRequester = user('u-kittipong');
const approver = user('u-pradit');
const approverWhoFiled = user('u-sunee');
const admin = user('u-admin');

describe('request:decide', () => {
  it('lets an uninvolved approver decide a pending request', () => {
    expect(can(approver, 'request:decide', { request: request('req-1003') }).allowed).toBe(true);
  });

  it('refuses a requester', () => {
    const result = can(requester, 'request:decide', { request: request('req-1003') });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('NOT_PERMITTED');
  });

  it('refuses self-approval even when the actor holds the approver role', () => {
    const result = can(approverWhoFiled, 'request:decide', { request: request('req-1005') });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('SELF_APPROVAL');
  });

  it('refuses self-approval for an administrator too', () => {
    const own: ResourceRequest = { ...request('req-1003'), requesterId: admin.id };
    expect(can(admin, 'request:decide', { request: own }).code).toBe('SELF_APPROVAL');
  });
});

describe('allocation:return', () => {
  it('lets the owning requester return their own allocation', () => {
    expect(can(requester, 'allocation:return', { request: request('req-1001') }).allowed).toBe(true);
  });

  it('refuses a requester returning someone else allocation', () => {
    const result = can(otherRequester, 'allocation:return', { request: request('req-1001') });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('NOT_OWNER');
  });

  it('refuses an approver who does not own the request', () => {
    expect(can(approver, 'allocation:return', { request: request('req-1001') }).code).toBe('NOT_PERMITTED');
  });

  it('allows an administrator', () => {
    expect(can(admin, 'allocation:return', { request: request('req-1001') }).allowed).toBe(true);
  });
});

describe('administrator-only actions', () => {
  for (const action of ['allocation:create', 'allocation:expire', 'capacity:manage', 'demo:reset', 'request:viewAll'] as const) {
    it(`allows ${action} for admin and refuses other roles`, () => {
      expect(can(admin, action).allowed).toBe(true);
      expect(can(requester, action).allowed).toBe(false);
      expect(can(approver, action).allowed).toBe(false);
    });
  }
});

describe('request:viewOne', () => {
  it('lets a requester open their own request', () => {
    expect(can(requester, 'request:viewOne', { request: request('req-1001') }).allowed).toBe(true);
  });

  it('refuses a requester opening another persons request', () => {
    expect(can(otherRequester, 'request:viewOne', { request: request('req-1001') }).code).toBe('NOT_OWNER');
  });

  it('lets an approver open a pending request but not a closed one they do not own', () => {
    expect(can(approver, 'request:viewOne', { request: request('req-1003') }).allowed).toBe(true);
    expect(can(approver, 'request:viewOne', { request: request('req-1001') }).allowed).toBe(false);
  });
});

describe('missing context', () => {
  it('refuses rather than throwing when no request is supplied', () => {
    const result = can(approver, 'request:decide');
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('MISSING_CONTEXT');
  });
});

describe('every denial explains itself', () => {
  it('always returns a human-readable reason', () => {
    const denials = [
      can(requester, 'demo:reset'),
      can(otherRequester, 'request:viewOne', { request: request('req-1001') }),
      can(approverWhoFiled, 'request:decide', { request: request('req-1005') }),
    ];
    for (const d of denials) {
      expect(d.allowed).toBe(false);
      expect(typeof d.reason).toBe('string');
      expect((d.reason ?? '').length).toBeGreaterThan(10);
    }
  });
});
