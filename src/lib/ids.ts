import type { ResourceRequest } from './types';

/**
 * All non-deterministic input to the workflow (the clock and id generation) is
 * funnelled through this interface so that:
 *   - rendering never calls Date.now() or Math.random() (no hydration mismatch), and
 *   - tests can inject a fixed clock and counter and assert exact values.
 */
export interface WorkflowEnv {
  /** Current time as an ISO-8601 string. */
  now(): string;
  /** A new unique id with the given prefix, e.g. "req", "alloc", "aud". */
  nextId(prefix: string): string;
}

/** Real environment: wall clock plus a monotonic counter. No randomness. */
export function createEnv(): WorkflowEnv {
  let counter = 0;
  return {
    now: () => new Date().toISOString(),
    nextId: (prefix: string) => {
      counter += 1;
      return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
    },
  };
}

/**
 * Deterministic environment for tests: the clock advances by a fixed step on
 * every call and ids are sequential, so every assertion is reproducible.
 */
export function createFixedEnv(options: { start?: string; stepMs?: number } = {}): WorkflowEnv {
  const start = options.start ?? '2026-10-12T00:00:00.000Z';
  const stepMs = options.stepMs ?? 1000;
  let tick = 0;
  const counters = new Map<string, number>();

  return {
    now: () => {
      const t = new Date(start).getTime() + tick * stepMs;
      tick += 1;
      return new Date(t).toISOString();
    },
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-test-${n}`;
    },
  };
}

/**
 * Next human-readable request code (RF-1008, ...), derived from the highest
 * existing code rather than from a counter that could drift out of sync.
 */
export function nextRequestCode(requests: readonly ResourceRequest[]): string {
  let highest = 1000;
  for (const r of requests) {
    const match = /^RF-(\d+)$/.exec(r.code);
    if (!match) continue;
    const value = Number.parseInt(match[1] as string, 10);
    if (Number.isFinite(value) && value > highest) highest = value;
  }
  return `RF-${highest + 1}`;
}
