import { describe, expect, it } from 'vitest';
import { validateState } from '@/lib/storage';
import { createSeedState } from '@/lib/seed';

const clone = () => createSeedState() as unknown as Record<string, unknown>;

describe('validateState', () => {
  it('accepts the seed state', () => {
    expect(validateState(createSeedState()).ok).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const bad of [null, undefined, 42, 'text', [1, 2, 3]]) {
      expect(validateState(bad).ok).toBe(false);
    }
  });

  it('rejects a mismatched schema version', () => {
    const s = clone();
    s.schemaVersion = 99;
    const result = validateState(s);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Schema version');
  });

  it('rejects a missing collection', () => {
    const s = clone();
    delete s.allocations;
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects an unknown request status', () => {
    const s = createSeedState();
    (s.requests[0] as { status: string }).status = 'SOMETHING_ELSE';
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects a negative quantity', () => {
    const s = createSeedState();
    s.requests[0]!.items[0]!.quantity = -5;
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects a dangling requester reference', () => {
    const s = createSeedState();
    s.requests[0]!.requesterId = 'u-does-not-exist';
    const result = validateState(s);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('requester');
  });

  it('rejects an allocation pointing at a missing request', () => {
    const s = createSeedState();
    s.allocations[0]!.requestId = 'req-nope';
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects duplicate ids', () => {
    const s = createSeedState();
    s.requests.push({ ...s.requests[0]! });
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects a pool whose baseline exceeds its total', () => {
    const s = createSeedState();
    s.pools[0]!.baselineAllocated = s.pools[0]!.total + 1;
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects a negative baseline', () => {
    const s = createSeedState();
    s.pools[0]!.baselineAllocated = -1;
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects baseline plus active allocations exceeding pool capacity', () => {
    const s = createSeedState();
    s.pools[3]!.total = 2; // two GPUs, both held by an active allocation
    s.pools[3]!.baselineAllocated = 1; // ...plus one already in use elsewhere
    const result = validateState(s);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('overcommitted');
  });

  it('accepts a pool that is exactly full', () => {
    const s = createSeedState();
    s.pools[3]!.total = 2; // baseline 0 + two GPUs allocated = exactly full
    expect(validateState(s).ok).toBe(true);
  });

  it('rejects an activeUserId that matches no user', () => {
    const s = createSeedState();
    s.activeUserId = 'u-ghost';
    expect(validateState(s).ok).toBe(false);
  });

  it('rejects an audit entry without an actor', () => {
    const s = createSeedState();
    (s.auditLog[0] as { actorId?: string }).actorId = '';
    expect(validateState(s).ok).toBe(false);
  });
});
