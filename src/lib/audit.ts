import type { AuditEntry, AuditOutcome, DemoState, DemoUser } from './types';
import type { WorkflowEnv } from './ids';

export interface AuditInput {
  action: string;
  targetType: AuditEntry['targetType'];
  targetId: string;
  outcome: AuditOutcome;
  summary: string;
  reason?: string;
}

/**
 * Build an audit entry. Only identity and outcome are recorded - never the full
 * body of a request, never an email address, never anything that would be
 * sensitive if this log were shown on screen (and it is, on the audit screen).
 */
export function createAuditEntry(env: WorkflowEnv, actor: DemoUser, input: AuditInput): AuditEntry {
  const entry: AuditEntry = {
    id: env.nextId('aud'),
    at: env.now(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: input.outcome,
    summary: input.summary,
  };
  return input.reason ? { ...entry, reason: input.reason } : entry;
}

/** Append an entry without mutating the original state. */
export function appendAudit(state: DemoState, entry: AuditEntry): DemoState {
  return { ...state, auditLog: [...state.auditLog, entry] };
}
