import { describe, expect, it } from 'vitest';
import { auditActions, auditCounts, filterAudit } from '@/lib/auditview';
import { applyAction } from '@/lib/dispatch';
import { freshState, testEnv, user } from './helpers';

/** A state with one allowed and one refused action on top of the seed log. */
function withActivity() {
  const state = freshState();
  const refused = applyAction(
    state,
    user(state, 'u-aree'),
    { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
    testEnv(),
  );
  const allowed = applyAction(
    refused.state,
    user(state, 'u-pradit'),
    { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
    testEnv(),
  );
  if (!allowed.ok) throw new Error('fixture failed');
  return allowed.state;
}

describe('filterAudit', () => {
  it('returns every entry when no filter is given, newest first', () => {
    const state = withActivity();
    const rows = filterAudit(state.auditLog);
    expect(rows.length).toBe(state.auditLog.length);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.at >= rows[i]!.at).toBe(true);
    }
  });

  it('does not mutate the log it was given', () => {
    const state = withActivity();
    const snapshot = structuredClone(state.auditLog);
    filterAudit(state.auditLog, { outcome: 'DENIED' });
    expect(state.auditLog).toEqual(snapshot);
  });

  it('separates allowed from refused', () => {
    const state = withActivity();
    const denied = filterAudit(state.auditLog, { outcome: 'DENIED' });
    const allowed = filterAudit(state.auditLog, { outcome: 'ALLOWED' });
    expect(denied.length).toBeGreaterThan(0);
    expect(denied.every((e) => e.outcome === 'DENIED')).toBe(true);
    expect(allowed.every((e) => e.outcome === 'ALLOWED')).toBe(true);
    expect(denied.length + allowed.length).toBe(state.auditLog.length);
  });

  it('filters by actor role', () => {
    const state = withActivity();
    const rows = filterAudit(state.auditLog, { role: 'ADMIN' });
    expect(rows.every((e) => e.actorRole === 'ADMIN')).toBe(true);
    expect(filterAudit(state.auditLog, { role: 'REQUESTER' }).length).toBeGreaterThan(0);
  });

  it('filters by target type and by action', () => {
    const state = withActivity();
    expect(filterAudit(state.auditLog, { targetType: 'ALLOCATION' }).every((e) => e.targetType === 'ALLOCATION')).toBe(true);
    const decides = filterAudit(state.auditLog, { action: 'request:decide' });
    expect(decides.length).toBeGreaterThan(0);
    expect(decides.every((e) => e.action === 'request:decide')).toBe(true);
  });

  it('searches action, target id, summary and actor name, case-insensitively', () => {
    const state = withActivity();
    expect(filterAudit(state.auditLog, { query: 'REQ-1003' }).length).toBeGreaterThan(0);
    expect(filterAudit(state.auditLog, { query: 'pradit' }).length).toBeGreaterThan(0);
    expect(filterAudit(state.auditLog, { query: 'allocation:' }).length).toBeGreaterThan(0);
    expect(filterAudit(state.auditLog, { query: 'zzzz-no-such-thing' })).toEqual([]);
  });

  it('combines filters', () => {
    const state = withActivity();
    const rows = filterAudit(state.auditLog, { role: 'REQUESTER', outcome: 'DENIED' });
    expect(rows.every((e) => e.actorRole === 'REQUESTER' && e.outcome === 'DENIED')).toBe(true);
    expect(rows.length).toBe(1);
  });

  it('returns an empty list rather than throwing when nothing matches', () => {
    const state = freshState();
    expect(filterAudit(state.auditLog, { role: 'ADMIN', outcome: 'DENIED' })).toEqual([]);
    expect(filterAudit([], { query: 'anything' })).toEqual([]);
  });

  it('shows only entries that really exist - a refusal adds exactly one', () => {
    const state = freshState();
    const before = state.auditLog.length;
    const refused = applyAction(state, user(state, 'u-aree'), { type: 'demo:reset' }, testEnv());
    expect(refused.ok).toBe(false);
    expect(filterAudit(refused.state.auditLog).length).toBe(before + 1);
    expect(filterAudit(refused.state.auditLog, { outcome: 'DENIED' }).length).toBe(1);
  });
});

describe('auditActions and auditCounts', () => {
  it('lists distinct actions, sorted', () => {
    const state = withActivity();
    const actions = auditActions(state.auditLog);
    expect(actions).toEqual([...new Set(actions)]);
    expect([...actions].sort()).toEqual(actions);
    expect(actions).toContain('request:decide');
  });

  it('counts allowed and refused so the totals always add up', () => {
    const state = withActivity();
    const counts = auditCounts(state.auditLog);
    expect(counts.total).toBe(state.auditLog.length);
    expect(counts.allowed + counts.denied).toBe(counts.total);
    expect(counts.denied).toBeGreaterThan(0);
  });

  it('handles an empty log', () => {
    expect(auditCounts([])).toEqual({ total: 0, allowed: 0, denied: 0 });
    expect(auditActions([])).toEqual([]);
  });
});
