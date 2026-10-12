import { afterEach, describe, expect, it } from 'vitest';
import { CORRUPT_KEY_PREFIX, STORAGE_KEY, loadState, probeStorage } from '@/lib/storage';
import { createSeedState } from '@/lib/seed';
import { SCHEMA_VERSION } from '@/lib/types';

/**
 * Minimal localStorage stand-in. `failWrites` lets a test make writes fail the
 * way a browser does when storage is blocked or the quota is exhausted.
 */
class FakeStorage {
  private map = new Map<string, string>();
  constructor(
    private options: { failWrites?: boolean; failReads?: boolean; failWriteFor?: (key: string) => boolean } = {},
  ) {}

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    if (this.options.failReads) throw new DOMException('read blocked');
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.options.failWrites) throw new DOMException('QuotaExceededError');
    if (this.options.failWriteFor?.(key)) throw new DOMException('QuotaExceededError');
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  /** Test-only peek that bypasses the failure switches. */
  raw(key: string): string | undefined {
    return this.map.get(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

function install(storage: FakeStorage): FakeStorage {
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return storage;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('probeStorage', () => {
  it('reports READY when reads and writes work', () => {
    install(new FakeStorage());
    expect(probeStorage()).toBe('READY');
  });

  it('reports READ_ONLY when writes fail but reads work', () => {
    install(new FakeStorage({ failWrites: true }));
    expect(probeStorage()).toBe('READ_ONLY');
  });

  it('reports UNAVAILABLE when both fail', () => {
    install(new FakeStorage({ failWrites: true, failReads: true }));
    expect(probeStorage()).toBe('UNAVAILABLE');
  });

  it('reports UNAVAILABLE with no window at all (server render)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(probeStorage()).toBe('UNAVAILABLE');
  });
});

describe('loadState on first visit', () => {
  it('seeds storage and reports SEED', () => {
    const storage = install(new FakeStorage());
    const result = loadState();
    expect(result.source).toBe('SEED');
    expect(result.persistence).toBe('READY');
    expect(result.notice).toBeUndefined();
    expect(storage.raw(STORAGE_KEY)).toBeDefined();
  });

  it('reads valid stored data back unchanged', () => {
    const storage = install(new FakeStorage());
    const stored = createSeedState();
    stored.activeUserId = 'u-admin';
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const result = loadState();
    expect(result.source).toBe('STORED');
    expect(result.state.activeUserId).toBe('u-admin');
  });
});

describe('schema migration v1 -> v2', () => {
  /** A v1 payload: schemaVersion 1 and pools carrying the old `allocated` field. */
  function legacyPayload(): string {
    const v2 = createSeedState();
    const v1 = {
      ...v2,
      schemaVersion: 1,
      pools: v2.pools.map((p) => ({
        id: p.id,
        kind: p.kind,
        label: p.label,
        unit: p.unit,
        total: p.total,
        allocated: p.baselineAllocated + 12,
      })),
    };
    return JSON.stringify(v1);
  }

  it('backs the old data up before writing anything, then reseeds', () => {
    const storage = install(new FakeStorage());
    const original = legacyPayload();
    storage.setItem(STORAGE_KEY, original);

    const result = loadState();

    expect(result.source).toBe('RECOVERED');
    expect(result.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.notice).toContain('Schema version');

    const backups = storage.keys().filter((k) => k.startsWith(CORRUPT_KEY_PREFIX));
    expect(backups.length).toBe(1);
    expect(storage.raw(backups[0]!)).toBe(original);

    // the live key now holds valid v2 data
    const live = JSON.parse(storage.raw(STORAGE_KEY)!) as { schemaVersion: number };
    expect(live.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('leaves the original bytes untouched when the backup cannot be written', () => {
    const storage = install(
      new FakeStorage({ failWriteFor: (key) => key.startsWith(CORRUPT_KEY_PREFIX) }),
    );
    const original = legacyPayload();
    storage.setItem(STORAGE_KEY, original);

    const result = loadState();

    expect(result.source).toBe('RECOVERED');
    expect(result.persistence).toBe('READ_ONLY');
    expect(result.notice).toContain('left exactly as it was');
    expect(storage.raw(STORAGE_KEY)).toBe(original);
    expect(storage.keys().filter((k) => k.startsWith(CORRUPT_KEY_PREFIX)).length).toBe(0);
  });

  it('does not touch stored data at all when storage is read-only', () => {
    const storage = new FakeStorage();
    const original = legacyPayload();
    storage.setItem(STORAGE_KEY, original);
    install(new FakeStorage({ failWrites: true }));
    // reinstall with the same contents but writes disabled
    (globalThis as { window?: unknown }).window = {
      localStorage: Object.assign(storage, { setItem: () => { throw new DOMException('blocked'); } }),
    };

    const result = loadState();
    expect(result.persistence).toBe('READ_ONLY');
    expect(result.source).toBe('RECOVERED');
    expect(storage.raw(STORAGE_KEY)).toBe(original);
  });
});

describe('loadState with damaged data', () => {
  it('recovers from invalid JSON and keeps a backup', () => {
    const storage = install(new FakeStorage());
    storage.setItem(STORAGE_KEY, '{ not json at all');

    const result = loadState();
    expect(result.source).toBe('RECOVERED');
    expect(result.notice).toContain('not valid JSON');
    expect(storage.keys().filter((k) => k.startsWith(CORRUPT_KEY_PREFIX)).length).toBe(1);
  });

  it('recovers from structurally invalid data', () => {
    const storage = install(new FakeStorage());
    const broken = createSeedState();
    broken.requests[0]!.requesterId = 'u-does-not-exist';
    storage.setItem(STORAGE_KEY, JSON.stringify(broken));

    const result = loadState();
    expect(result.source).toBe('RECOVERED');
    expect(result.state.requests.length).toBe(createSeedState().requests.length);
  });

  it('falls back to memory without writing when reads throw', () => {
    install(new FakeStorage({ failReads: true, failWrites: true }));
    const result = loadState();
    expect(result.persistence).toBe('UNAVAILABLE');
    expect(result.source).toBe('SEED');
    expect(result.notice).toContain('memory only');
  });
});
