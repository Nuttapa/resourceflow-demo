import type { Allocation } from './types';

/** "12 cores", "1,400 GB" - plain, locale-independent so tests are stable. */
export function formatQuantity(value: number, unit: string): string {
  return `${value.toLocaleString('en-US')} ${unit}`;
}

/** Percentage of a pool in use, clamped to 0-100 and rounded to a whole number. */
export function percentUsed(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

/**
 * An allocation is "overdue" when its expiry date has passed while it is still
 * ALLOCATED. This is a display concept only: nothing in the workflow changes an
 * allocation's status because of the clock. Only an Administrator can expire one.
 */
export function isOverdue(allocation: Allocation, nowIso: string): boolean {
  if (allocation.status !== 'ALLOCATED') return false;
  const expires = new Date(allocation.expiresAt).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(expires) || !Number.isFinite(now)) return false;
  return now > expires;
}

/** Days between two ISO timestamps, rounded towards zero. Negative when in the past. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.trunc((to - from) / 86_400_000);
}

/** Expiry timestamp for an allocation of `durationDays` starting at `startIso`. */
export function addDays(startIso: string, days: number): string {
  const start = new Date(startIso).getTime();
  return new Date(start + days * 86_400_000).toISOString();
}
