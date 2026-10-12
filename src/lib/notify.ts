import type { PersistenceStatus } from './storage';
import type { WorkflowResult } from './workflow';

export type NoticeTone = 'success' | 'warning' | 'error';

export interface Notice {
  tone: NoticeTone;
  title: string;
  message?: string;
}

/**
 * Turns a workflow result plus the outcome of the save into the message the
 * user sees. Pure, so the rule that matters most here is testable:
 *
 *   a "success" is only ever shown when the action was applied AND persisted.
 *
 * If the action worked but could not be saved, the user is told plainly that it
 * lives only in this browser session. Nothing ever claims to have been saved
 * without evidence that the write succeeded.
 */
export function describeOutcome(
  result: WorkflowResult,
  persisted: boolean,
  persistence: PersistenceStatus,
): Notice {
  if (!result.ok) {
    return {
      tone: 'error',
      title: 'Action refused',
      message: result.reason,
    };
  }

  if (persisted) {
    return { tone: 'success', title: result.audit.summary };
  }

  if (persistence === 'UNAVAILABLE') {
    return {
      tone: 'warning',
      title: `${result.audit.summary} (not saved)`,
      message: 'Browser storage is unavailable, so this change exists only until you reload the page.',
    };
  }

  return {
    tone: 'warning',
    title: `${result.audit.summary} (not saved)`,
    message: 'The change was applied in this session but could not be written to browser storage.',
  };
}
