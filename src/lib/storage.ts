import { createSeedState } from './seed';
import {
  ALLOCATION_STATUSES,
  REQUEST_STATUSES,
  ROLES,
  SCHEMA_VERSION,
  type DemoState,
} from './types';

export const STORAGE_KEY = 'cloudflow_demo.v1';
export const CORRUPT_KEY_PREFIX = 'cloudflow_demo.corrupt.';

/**
 * READY       - we can read and write; changes persist.
 * READ_ONLY   - we could read, but writing failed (quota, blocked, backup refused).
 *               The app runs from memory and MUST NOT try to overwrite what is stored.
 * UNAVAILABLE - localStorage cannot be used at all (private mode, blocked, no window).
 */
export type PersistenceStatus = 'READY' | 'READ_ONLY' | 'UNAVAILABLE';

export type LoadSource = 'STORED' | 'SEED' | 'RECOVERED';

export interface LoadResult {
  state: DemoState;
  source: LoadSource;
  persistence: PersistenceStatus;
  /** Human-readable explanation shown in the UI when something was not normal. */
  notice?: string;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Structural validation that goes beyond schemaVersion: shape, value domains,
 * uniqueness of ids, referential integrity and capacity arithmetic.
 * Returns a reason instead of throwing so callers can recover gracefully.
 */
export function validateState(input: unknown): ValidationResult {
  if (!isObject(input)) return { ok: false, reason: 'Stored value is not an object.' };

  if (input.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: `Schema version mismatch (found ${String(input.schemaVersion)}, expected ${SCHEMA_VERSION}).` };
  }

  for (const key of ['users', 'pools', 'requests', 'allocations', 'auditLog'] as const) {
    if (!Array.isArray(input[key])) return { ok: false, reason: `Field "${key}" is missing or not an array.` };
  }

  const users = input.users as unknown[];
  const pools = input.pools as unknown[];
  const requests = input.requests as unknown[];
  const allocations = input.allocations as unknown[];
  const auditLog = input.auditLog as unknown[];

  const userIds = new Set<string>();
  for (const u of users) {
    if (!isObject(u) || !isNonEmptyString(u.id)) return { ok: false, reason: 'A user record has no valid id.' };
    if (userIds.has(u.id)) return { ok: false, reason: `Duplicate user id "${u.id}".` };
    userIds.add(u.id);
    if (!ROLES.includes(u.role as never)) return { ok: false, reason: `User "${u.id}" has an unknown role.` };
    if (!isNonEmptyString(u.name) || !isNonEmptyString(u.email)) return { ok: false, reason: `User "${u.id}" is missing a name or email.` };
  }
  if (userIds.size === 0) return { ok: false, reason: 'No users in stored data.' };

  const poolIds = new Set<string>();
  const poolTotals = new Map<string, number>();
  const poolBaselines = new Map<string, number>();
  for (const p of pools) {
    if (!isObject(p) || !isNonEmptyString(p.id)) return { ok: false, reason: 'A resource pool has no valid id.' };
    if (poolIds.has(p.id)) return { ok: false, reason: `Duplicate pool id "${p.id}".` };
    poolIds.add(p.id);
    if (!isFiniteNumber(p.total) || p.total < 0) return { ok: false, reason: `Pool "${p.id}" has an invalid total.` };
    if (!isFiniteNumber(p.baselineAllocated) || p.baselineAllocated < 0) {
      return { ok: false, reason: `Pool "${p.id}" has an invalid baseline allocation.` };
    }
    if (p.baselineAllocated > p.total) {
      return { ok: false, reason: `Pool "${p.id}" has a baseline larger than its total capacity.` };
    }
    poolTotals.set(p.id, p.total);
    poolBaselines.set(p.id, p.baselineAllocated);
  }

  const requestIds = new Set<string>();
  for (const r of requests) {
    if (!isObject(r) || !isNonEmptyString(r.id)) return { ok: false, reason: 'A request has no valid id.' };
    if (requestIds.has(r.id)) return { ok: false, reason: `Duplicate request id "${r.id}".` };
    requestIds.add(r.id);
    if (!REQUEST_STATUSES.includes(r.status as never)) return { ok: false, reason: `Request "${r.id}" has an unknown status.` };
    if (!userIds.has(r.requesterId as string)) return { ok: false, reason: `Request "${r.id}" points at a requester that does not exist.` };
    if (!isFiniteNumber(r.durationDays) || r.durationDays <= 0) return { ok: false, reason: `Request "${r.id}" has an invalid duration.` };
    if (!Array.isArray(r.items) || r.items.length === 0) return { ok: false, reason: `Request "${r.id}" has no resource items.` };
    for (const item of r.items as unknown[]) {
      if (!isObject(item) || !poolIds.has(item.poolId as string)) return { ok: false, reason: `Request "${r.id}" references an unknown resource pool.` };
      if (!isFiniteNumber(item.quantity) || item.quantity <= 0) return { ok: false, reason: `Request "${r.id}" has a non-positive quantity.` };
    }
  }

  const allocationIds = new Set<string>();
  const activeUse = new Map<string, number>();
  for (const a of allocations) {
    if (!isObject(a) || !isNonEmptyString(a.id)) return { ok: false, reason: 'An allocation has no valid id.' };
    if (allocationIds.has(a.id)) return { ok: false, reason: `Duplicate allocation id "${a.id}".` };
    allocationIds.add(a.id);
    if (!ALLOCATION_STATUSES.includes(a.status as never)) return { ok: false, reason: `Allocation "${a.id}" has an unknown status.` };
    if (!requestIds.has(a.requestId as string)) return { ok: false, reason: `Allocation "${a.id}" points at a request that does not exist.` };
    if (!Array.isArray(a.items)) return { ok: false, reason: `Allocation "${a.id}" has no items array.` };
    for (const item of a.items as unknown[]) {
      if (!isObject(item) || !poolIds.has(item.poolId as string)) return { ok: false, reason: `Allocation "${a.id}" references an unknown resource pool.` };
      if (!isFiniteNumber(item.quantity) || item.quantity <= 0) return { ok: false, reason: `Allocation "${a.id}" has a non-positive quantity.` };
      if (a.status === 'ALLOCATED') {
        const poolId = item.poolId as string;
        activeUse.set(poolId, (activeUse.get(poolId) ?? 0) + (item.quantity as number));
      }
    }
  }

  // Capacity arithmetic: baseline plus every active allocation must fit inside
  // the pool. This mirrors lib/capacity.ts, which derives the same numbers at runtime.
  for (const poolId of poolIds) {
    const total = poolTotals.get(poolId) ?? 0;
    const baseline = poolBaselines.get(poolId) ?? 0;
    const used = baseline + (activeUse.get(poolId) ?? 0);
    if (used > total) {
      return { ok: false, reason: `Pool "${poolId}" is overcommitted: ${used} of ${total} in use.` };
    }
  }

  for (const e of auditLog) {
    if (!isObject(e) || !isNonEmptyString(e.id)) return { ok: false, reason: 'An audit entry has no valid id.' };
    if (!isNonEmptyString(e.actorId)) return { ok: false, reason: `Audit entry "${e.id}" has no actor.` };
    if (e.outcome !== 'ALLOWED' && e.outcome !== 'DENIED') return { ok: false, reason: `Audit entry "${e.id}" has an invalid outcome.` };
  }

  if (!isNonEmptyString(input.activeUserId) || !userIds.has(input.activeUserId)) {
    return { ok: false, reason: 'activeUserId does not match any user.' };
  }

  return { ok: true };
}

/** True when localStorage can be both read and written in this browser context. */
export function probeStorage(): PersistenceStatus {
  if (typeof window === 'undefined') return 'UNAVAILABLE';
  let store: Storage;
  try {
    store = window.localStorage;
    if (!store) return 'UNAVAILABLE';
  } catch {
    return 'UNAVAILABLE';
  }
  const probeKey = `${STORAGE_KEY}.__probe__`;
  try {
    store.setItem(probeKey, '1');
    store.removeItem(probeKey);
    return 'READY';
  } catch {
    // Readable but not writable (quota exhausted, or storage blocked for writes).
    try {
      store.getItem(STORAGE_KEY);
      return 'READ_ONLY';
    } catch {
      return 'UNAVAILABLE';
    }
  }
}

/**
 * Load demo state, never throwing. Falls back to seed data on any problem and
 * reports what happened so the UI can tell the user.
 *
 * Overwrite safety: stored data that fails validation is copied to a timestamped
 * backup key BEFORE anything is written back. If that backup cannot be written,
 * we switch to READ_ONLY and leave the original bytes untouched rather than
 * destroying data we did not understand.
 */
export function loadState(): LoadResult {
  const persistence = probeStorage();
  const seed = createSeedState();

  if (persistence === 'UNAVAILABLE') {
    return {
      state: seed,
      source: 'SEED',
      persistence,
      notice: 'Browser storage is unavailable, so this demo is running from memory only. Your changes will disappear when the page reloads.',
    };
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return {
      state: seed,
      source: 'SEED',
      persistence: 'UNAVAILABLE',
      notice: 'Browser storage could not be read, so this demo is running from memory only.',
    };
  }

  if (raw === null) {
    if (persistence === 'READY') {
      const written = writeState(seed);
      if (!written) {
        return { state: seed, source: 'SEED', persistence: 'READ_ONLY', notice: 'Default demo data could not be saved, so changes will not persist.' };
      }
    }
    return { state: seed, source: 'SEED', persistence };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return recover(raw, seed, persistence, 'Saved demo data was not valid JSON.');
  }

  const validation = validateState(parsed);
  if (!validation.ok) {
    return recover(raw, seed, persistence, validation.reason ?? 'Saved demo data did not match the expected structure.');
  }

  return { state: parsed as DemoState, source: 'STORED', persistence };
}

function recover(raw: string, seed: DemoState, persistence: PersistenceStatus, reason: string): LoadResult {
  if (persistence !== 'READY') {
    return {
      state: seed,
      source: 'RECOVERED',
      persistence: 'READ_ONLY',
      notice: `${reason} Default data was loaded into memory. The damaged data was left untouched because storage is not writable.`,
    };
  }

  const backupKey = `${CORRUPT_KEY_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    window.localStorage.setItem(backupKey, raw);
  } catch {
    // Could not back up - refuse to overwrite data we cannot preserve.
    return {
      state: seed,
      source: 'RECOVERED',
      persistence: 'READ_ONLY',
      notice: `${reason} Default data was loaded into memory, but the damaged data could not be backed up, so it was left exactly as it was.`,
    };
  }

  const written = writeState(seed);
  return {
    state: seed,
    source: 'RECOVERED',
    persistence: written ? 'READY' : 'READ_ONLY',
    notice: `${reason} Default demo data was restored; a copy of the damaged data was kept under "${backupKey}".`,
  };
}

/** Persist state. Returns false instead of throwing when the write is refused. */
export function writeState(state: DemoState): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Replace stored state with a fresh seed. Returns the new state. */
export function resetState(): DemoState {
  const seed = createSeedState();
  writeState(seed);
  return seed;
}

/** Backup keys left behind by earlier recoveries, newest first. */
export function listCorruptBackups(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(CORRUPT_KEY_PREFIX)) keys.push(key);
    }
    return keys.sort().reverse();
  } catch {
    return [];
  }
}
