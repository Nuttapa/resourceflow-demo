import { describe, expect, it } from 'vitest';
import { requestTimeline } from '@/lib/timeline';
import { applyAction } from '@/lib/dispatch';
import { freshState, testEnv, user } from './helpers';

describe('requestTimeline', () => {
  it('returns nothing for an unknown request', () => {
    expect(requestTimeline(freshState(), 'req-nope')).toEqual([]);
  });

  it('is sorted oldest first', () => {
    const state = freshState();
    const events = requestTimeline(state, 'req-1001');
    expect(events.length).toBeGreaterThan(1);
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i - 1]!.at <= events[i]!.at).toBe(true);
    }
  });

  it('uses audit entries where they exist', () => {
    const state = freshState();
    const events = requestTimeline(state, 'req-1001');
    const audited = events.filter((e) => e.source === 'AUDIT');
    expect(audited.length).toBeGreaterThan(0);
    expect(audited.every((e) => e.actorName && e.actorRole)).toBe(true);
  });

  it('includes audit entries for the allocation behind the request', () => {
    const state = freshState();
    const labels = requestTimeline(state, 'req-1001').map((e) => e.label);
    expect(labels.join(' | ')).toContain('Allocated resources');
  });

  it('falls back to the stored record only where no audit entry covers the step', () => {
    const state = freshState();
    // req-1003 has no audit history at all in the seed data.
    const events = requestTimeline(state, 'req-1003');
    expect(events.length).toBe(1);
    expect(events[0]!.source).toBe('RECORD');
    expect(events[0]!.label).toContain('RF-1003');
    expect(events[0]!.at).toBe(state.requests.find((r) => r.id === 'req-1003')!.createdAt);
  });

  it('never invents an event: every timestamp exists in the stored data', () => {
    const state = freshState();
    const known = new Set<string>();
    for (const r of state.requests) {
      known.add(r.createdAt);
      if (r.decidedAt) known.add(r.decidedAt);
    }
    for (const a of state.allocations) {
      known.add(a.allocatedAt);
      if (a.closedAt) known.add(a.closedAt);
    }
    for (const e of state.auditLog) known.add(e.at);

    for (const id of state.requests.map((r) => r.id)) {
      for (const event of requestTimeline(state, id)) {
        expect(known.has(event.at)).toBe(true);
      }
    }
  });

  it('records a refused attempt without changing the request', () => {
    const state = freshState();
    const refused = applyAction(
      state,
      user(state, 'u-aree'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE' },
      testEnv(),
    );
    expect(refused.ok).toBe(false);

    const events = requestTimeline(refused.state, 'req-1003');
    const denied = events.filter((e) => e.outcome === 'DENIED');
    expect(denied.length).toBe(1);
    expect(denied[0]!.source).toBe('AUDIT');
    expect(denied[0]!.reason).toBeDefined();
    expect(refused.state.requests.find((r) => r.id === 'req-1003')!.status).toBe('PENDING');
  });

  it('grows by exactly one allowed event per successful action', () => {
    const state = freshState();
    const before = requestTimeline(state, 'req-1003').length;

    const approved = applyAction(
      state,
      user(state, 'u-pradit'),
      { type: 'request:decide', requestId: 'req-1003', decision: 'APPROVE', note: 'fine' },
      testEnv(),
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    const after = requestTimeline(approved.state, 'req-1003');
    expect(after.length).toBe(before + 1);
    const last = after[after.length - 1]!;
    expect(last.source).toBe('AUDIT');
    expect(last.outcome).toBe('ALLOWED');
    expect(last.actorName).toBe('Dr. Pradit Chaiyo');
    expect(last.reason).toBe('fine');
  });

  it('does not duplicate a step once a real audit entry exists for it', () => {
    const state = freshState();
    const created = applyAction(
      state,
      user(state, 'u-aree'),
      {
        type: 'request:create',
        draft: {
          title: 'Audited from the start',
          purpose: 'This one has a real creation audit entry.',
          items: [{ poolId: 'pool-cpu', quantity: 1 }],
          durationDays: 5,
        },
      },
      testEnv(),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const id = created.state.requests.at(-1)!.id;
    const events = requestTimeline(created.state, id);
    expect(events.length).toBe(1);
    expect(events[0]!.source).toBe('AUDIT');
  });
});
