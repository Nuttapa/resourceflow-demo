import type { AuditEntry, AuditOutcome, Role } from './types';

export type RoleFilter = Role | 'ALL';
export type OutcomeFilter = AuditOutcome | 'ALL';
export type TargetFilter = AuditEntry['targetType'] | 'ALL';

export interface AuditFilter {
  /** Matches action, target id, summary or actor name, case-insensitively. */
  query?: string;
  role?: RoleFilter;
  outcome?: OutcomeFilter;
  targetType?: TargetFilter;
  action?: string | 'ALL';
}

/**
 * Read-only view over the audit log: filtering and sorting only.
 *
 * Nothing in the application edits or deletes an audit entry - the log is
 * append-only, written by the workflow and replaced in full only by a demo
 * reset. This function never mutates what it is given.
 */
export function filterAudit(entries: readonly AuditEntry[], filter: AuditFilter = {}): AuditEntry[] {
  const needle = (filter.query ?? '').trim().toLowerCase();

  return entries
    .filter((entry) => {
      if (filter.role && filter.role !== 'ALL' && entry.actorRole !== filter.role) return false;
      if (filter.outcome && filter.outcome !== 'ALL' && entry.outcome !== filter.outcome) return false;
      if (filter.targetType && filter.targetType !== 'ALL' && entry.targetType !== filter.targetType) return false;
      if (filter.action && filter.action !== 'ALL' && entry.action !== filter.action) return false;
      if (needle.length === 0) return true;
      return (
        entry.action.toLowerCase().includes(needle) ||
        entry.targetId.toLowerCase().includes(needle) ||
        entry.summary.toLowerCase().includes(needle) ||
        entry.actorName.toLowerCase().includes(needle)
      );
    })
    .slice()
    .sort((a, b) => {
      // Newest first; ties broken by id so the order is stable and reproducible.
      const byTime = b.at.localeCompare(a.at);
      return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
    });
}

/** Distinct action names present in the log, sorted, for a filter dropdown. */
export function auditActions(entries: readonly AuditEntry[]): string[] {
  return [...new Set(entries.map((e) => e.action))].sort();
}

export interface AuditCounts {
  total: number;
  allowed: number;
  denied: number;
}

export function auditCounts(entries: readonly AuditEntry[]): AuditCounts {
  let allowed = 0;
  let denied = 0;
  for (const entry of entries) {
    if (entry.outcome === 'ALLOWED') allowed += 1;
    else denied += 1;
  }
  return { total: entries.length, allowed, denied };
}
