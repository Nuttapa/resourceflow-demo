import { describe, expect, it } from 'vitest';
import { describeOutcome } from '@/lib/notify';
import { applyAction } from '@/lib/dispatch';
import { freshState, testEnv, user } from './helpers';
import type { PersistenceStatus } from '@/lib/storage';
import type { WorkflowResult } from '@/lib/workflow';

function allowedResult(): WorkflowResult {
  const state = freshState();
  const result = applyAction(
    state,
    user(state, 'u-pradit'),
    { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
    testEnv(),
  );
  if (!result.ok) throw new Error('fixture should have been allowed');
  return result;
}

function refusedResult(): WorkflowResult {
  const state = freshState();
  const result = applyAction(state, user(state, 'u-aree'), { type: 'demo:reset' }, testEnv());
  if (result.ok) throw new Error('fixture should have been refused');
  return result;
}

const ALL_PERSISTENCE: PersistenceStatus[] = ['READY', 'READ_ONLY', 'UNAVAILABLE'];

describe('describeOutcome', () => {
  it('reports success only when the action was applied AND saved', () => {
    const notice = describeOutcome(allowedResult(), true, 'READY');
    expect(notice.tone).toBe('success');
    expect(notice.title).toContain('Approved');
  });

  it('warns instead of claiming success when the save failed', () => {
    const notice = describeOutcome(allowedResult(), false, 'READ_ONLY');
    expect(notice.tone).toBe('warning');
    expect(notice.title).toContain('not saved');
    expect(notice.message).toContain('could not be written');
  });

  it('explains that storage is unavailable when that is the reason', () => {
    const notice = describeOutcome(allowedResult(), false, 'UNAVAILABLE');
    expect(notice.tone).toBe('warning');
    expect(notice.message).toContain('unavailable');
  });

  it('reports a refusal as an error carrying the workflow reason', () => {
    const result = refusedResult();
    const notice = describeOutcome(result, false, 'READY');
    expect(notice.tone).toBe('error');
    expect(notice.title).toBe('Action refused');
    if (result.ok) return;
    expect(notice.message).toBe(result.reason);
  });

  it('never reports success for a refused action, however the save went', () => {
    const result = refusedResult();
    for (const persistence of ALL_PERSISTENCE) {
      for (const persisted of [true, false]) {
        expect(describeOutcome(result, persisted, persistence).tone).toBe('error');
      }
    }
  });

  it('never reports success for an unsaved action, in any persistence state', () => {
    const result = allowedResult();
    for (const persistence of ALL_PERSISTENCE) {
      expect(describeOutcome(result, false, persistence).tone).not.toBe('success');
    }
  });

  it('every notice has a non-empty title', () => {
    for (const result of [allowedResult(), refusedResult()]) {
      for (const persisted of [true, false]) {
        const notice = describeOutcome(result, persisted, 'READY');
        expect(notice.title.length).toBeGreaterThan(3);
      }
    }
  });
});
