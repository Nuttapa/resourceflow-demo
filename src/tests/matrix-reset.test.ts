import { describe, expect, it } from 'vitest';
import { buildPermissionMatrix } from '@/lib/matrix';
import { can } from '@/lib/permissions';
import { applyAction } from '@/lib/dispatch';
import { describeOutcome } from '@/lib/notify';
import { createSeedState } from '@/lib/seed';
import { CORRUPT_KEY_PREFIX, STORAGE_KEY, loadState } from '@/lib/storage';
import { expectRefusedCleanly, freshState, testEnv, user } from './helpers';
import { SCHEMA_VERSION } from '@/lib/types';

describe('permission matrix is generated from the real rules', () => {
  const state = freshState();
  const matrix = buildPermissionMatrix(state);

  it('covers one persona per role', () => {
    expect(matrix.personas.map((p) => p.role)).toEqual(['REQUESTER', 'APPROVER', 'ADMIN']);
  });

  it('every cell matches a direct call to can()', () => {
    for (const row of matrix.rows) {
      for (const cell of row.cells) {
        const persona = matrix.personas.find((p) => p.role === cell.role)!;
        const context = row.conditional
          ? { request: { ...state.requests[0]!, requesterId: 'fixture-other-user', status: 'PENDING' as const } }
          : {};
        expect(cell.allowed).toBe(can(persona, row.action, context).allowed);
      }
    }
  });

  it('flags rows that depend on an entity and names the fixture used', () => {
    for (const row of matrix.rows) {
      if (row.conditional) expect(row.fixture.length).toBeGreaterThan(5);
      else expect(row.fixture).toBe('');
    }
    expect(matrix.rows.find((r) => r.action === 'request:decide')!.conditional).toBe(true);
    expect(matrix.rows.find((r) => r.action === 'demo:reset')!.conditional).toBe(false);
  });

  it('shows approvers and administrators able to decide somebody else request', () => {
    const decide = matrix.rows.find((r) => r.action === 'request:decide')!;
    expect(decide.cells.find((c) => c.role === 'APPROVER')!.allowed).toBe(true);
    expect(decide.cells.find((c) => c.role === 'ADMIN')!.allowed).toBe(true);
    expect(decide.cells.find((c) => c.role === 'REQUESTER')!.allowed).toBe(false);
  });

  it('does not let a conditional row be read as unconditional: self-approval is refused for every role', () => {
    const own = matrix.conditionals.find((c) => c.id === 'decide-own')!;
    expect(own.cells.every((cell) => cell.allowed === false)).toBe(true);
    expect(own.cells.every((cell) => cell.code === 'SELF_APPROVAL' || cell.code === 'NOT_PERMITTED')).toBe(true);
  });

  it('shows the ownership rule for returning an allocation', () => {
    const ownReturn = matrix.conditionals.find((c) => c.id === 'return-own')!;
    expect(ownReturn.cells.find((c) => c.role === 'REQUESTER')!.allowed).toBe(true);
    expect(ownReturn.cells.find((c) => c.role === 'ADMIN')!.allowed).toBe(true);

    const foreignReturn = matrix.rows.find((r) => r.action === 'allocation:return')!;
    expect(foreignReturn.cells.find((c) => c.role === 'REQUESTER')!.allowed).toBe(false);
    expect(foreignReturn.cells.find((c) => c.role === 'APPROVER')!.allowed).toBe(false);
  });

  it('gives a reason for every refusal it displays', () => {
    const cells = [...matrix.rows.flatMap((r) => r.cells), ...matrix.conditionals.flatMap((c) => c.cells)];
    for (const cell of cells) {
      if (!cell.allowed) expect((cell.reason ?? '').length).toBeGreaterThan(10);
    }
  });
});

describe('demo reset', () => {
  it('is refused for every role except an administrator', () => {
    const state = freshState();
    for (const id of ['u-aree', 'u-kittipong', 'u-pradit', 'u-sunee']) {
      const result = applyAction(state, user(state, id), { type: 'demo:reset' }, testEnv());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('NOT_PERMITTED');
      expectRefusedCleanly(state, result.state);
    }
  });

  it('restores the seed and replaces the audit log, keeping the reset entry', () => {
    const state = freshState();
    const dirty = applyAction(
      state,
      user(state, 'u-aree'),
      {
        type: 'request:create',
        draft: {
          title: 'Will be discarded',
          purpose: 'This request should not survive the reset.',
          items: [{ poolId: 'pool-cpu', quantity: 1 }],
          durationDays: 2,
        },
      },
      testEnv(),
    );
    expect(dirty.ok).toBe(true);
    if (!dirty.ok) return;

    const result = applyAction(dirty.state, user(state, 'u-admin'), { type: 'demo:reset' }, testEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const seed = createSeedState();
    expect(result.state.requests).toEqual(seed.requests);
    expect(result.state.allocations).toEqual(seed.allocations);
    expect(result.state.pools).toEqual(seed.pools);
    expect(result.state.users).toEqual(seed.users);
    expect(result.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.state.activeUserId).toBe('u-admin');

    // The old history is NOT kept - this is the documented behaviour.
    expect(result.state.auditLog.length).toBe(seed.auditLog.length + 1);
    const last = result.state.auditLog.at(-1)!;
    expect(last.action).toBe('demo:reset');
    expect(last.outcome).toBe('ALLOWED');
    expect(last.actorId).toBe('u-admin');
    expect(last.targetType).toBe('DEMO');
  });

  it('never reports success when the save failed', () => {
    const state = freshState();
    const result = applyAction(state, user(state, 'u-admin'), { type: 'demo:reset' }, testEnv());
    expect(describeOutcome(result, true, 'READY').tone).toBe('success');
    for (const persistence of ['READY', 'READ_ONLY', 'UNAVAILABLE'] as const) {
      expect(describeOutcome(result, false, persistence).tone).toBe('warning');
    }
  });
});

describe('reset does not bypass the recovery mechanism', () => {
  class FakeStorage {
    private map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    key(i: number) {
      return [...this.map.keys()][i] ?? null;
    }
    getItem(k: string) {
      return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      this.map.set(k, v);
    }
    removeItem(k: string) {
      this.map.delete(k);
    }
    keys() {
      return [...this.map.keys()];
    }
  }

  it('leaves backups of damaged data in place', () => {
    const storage = new FakeStorage();
    (globalThis as { window?: unknown }).window = { localStorage: storage };

    // Damaged data is backed up, then replaced with the seed.
    storage.setItem(STORAGE_KEY, '{ broken json');
    const recovered = loadState();
    expect(recovered.source).toBe('RECOVERED');
    const backups = storage.keys().filter((k) => k.startsWith(CORRUPT_KEY_PREFIX));
    expect(backups.length).toBe(1);

    // A reset only ever replaces the live key; the backup survives.
    const result = applyAction(recovered.state, user(recovered.state, 'u-admin'), { type: 'demo:reset' }, testEnv());
    expect(result.ok).toBe(true);
    storage.setItem(STORAGE_KEY, JSON.stringify(result.ok ? result.state : {}));
    expect(storage.keys().filter((k) => k.startsWith(CORRUPT_KEY_PREFIX)).length).toBe(1);

    delete (globalThis as { window?: unknown }).window;
  });
});
