import type { AuditOutcome, DemoState } from './types';

export interface TimelineEvent {
  id: string;
  at: string;
  label: string;
  outcome: AuditOutcome;
  actorName?: string;
  actorRole?: string;
  reason?: string;
  /**
   * AUDIT  - taken from a real audit entry.
   * RECORD - read straight off the request or allocation record, because this
   *          demo's seed history does not include an audit entry for it.
   *          Nothing here is invented to pad the timeline out.
   */
  source: 'AUDIT' | 'RECORD';
}

/**
 * Everything known about one request's history: audit entries for the request
 * itself, audit entries for its allocation, and the timestamps stored on the
 * records themselves. Sorted oldest first.
 */
export function requestTimeline(state: DemoState, requestId: string): TimelineEvent[] {
  const request = state.requests.find((r) => r.id === requestId);
  if (!request) return [];

  const allocationIds = new Set(
    state.allocations.filter((a) => a.requestId === requestId).map((a) => a.id),
  );

  const events: TimelineEvent[] = [];
  const auditedActions = new Set<string>();

  for (const entry of state.auditLog) {
    const relevant =
      (entry.targetType === 'REQUEST' && entry.targetId === requestId) ||
      (entry.targetType === 'ALLOCATION' && allocationIds.has(entry.targetId));
    if (!relevant) continue;

    if (entry.outcome === 'ALLOWED') auditedActions.add(entry.action);
    events.push({
      id: entry.id,
      at: entry.at,
      label: entry.summary,
      outcome: entry.outcome,
      actorName: entry.actorName,
      actorRole: entry.actorRole,
      ...(entry.reason ? { reason: entry.reason } : {}),
      source: 'AUDIT',
    });
  }

  // Fill in from the records only where no audit entry covers the same step.
  if (!auditedActions.has('request:create')) {
    events.push({
      id: `${request.id}:created`,
      at: request.createdAt,
      label: `Submitted ${request.code}`,
      outcome: 'ALLOWED',
      source: 'RECORD',
    });
  }

  if (request.decidedAt && !auditedActions.has('request:decide') && !auditedActions.has('request:cancel')) {
    const who = state.users.find((u) => u.id === request.decidedBy);
    events.push({
      id: `${request.id}:decided`,
      at: request.decidedAt,
      label: `Marked ${request.status.toLowerCase()}`,
      outcome: 'ALLOWED',
      ...(who ? { actorName: who.name, actorRole: who.role } : {}),
      ...(request.decisionNote ? { reason: request.decisionNote } : {}),
      source: 'RECORD',
    });
  }

  for (const allocation of state.allocations) {
    if (allocation.requestId !== requestId) continue;
    if (!auditedActions.has('allocation:create')) {
      const who = state.users.find((u) => u.id === allocation.allocatedBy);
      events.push({
        id: `${allocation.id}:allocated`,
        at: allocation.allocatedAt,
        label: 'Resources allocated',
        outcome: 'ALLOWED',
        ...(who ? { actorName: who.name, actorRole: who.role } : {}),
        source: 'RECORD',
      });
    }
    if (allocation.closedAt && !auditedActions.has('allocation:return') && !auditedActions.has('allocation:expire')) {
      const who = state.users.find((u) => u.id === allocation.closedBy);
      events.push({
        id: `${allocation.id}:closed`,
        at: allocation.closedAt,
        label: allocation.status === 'RETURNED' ? 'Allocation returned' : 'Allocation expired',
        outcome: 'ALLOWED',
        ...(who ? { actorName: who.name, actorRole: who.role } : {}),
        source: 'RECORD',
      });
    }
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}
