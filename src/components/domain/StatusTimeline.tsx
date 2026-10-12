import { Badge } from '@/components/ui/Badge';
import type { TimelineEvent } from '@/lib/timeline';

function dotClass(event: TimelineEvent): string {
  if (event.outcome === 'DENIED') return 'bg-danger';
  return event.source === 'AUDIT' ? 'bg-accent' : 'bg-muted';
}

/**
 * Shows only what the demo actually knows. Events marked "from record" have no
 * audit entry behind them - the seed history predates the audit log - and that
 * is stated rather than papered over with invented events.
 */
export function StatusTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted">
        No history has been recorded for this request yet.
      </p>
    );
  }

  const hasRecordOnly = events.some((e) => e.source === 'RECORD');

  return (
    <div>
      <ol className="relative space-y-4 border-l border-line pl-5">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span
              aria-hidden="true"
              className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${dotClass(event)}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{event.label}</p>
              {event.outcome === 'DENIED' ? <Badge tone="danger">Refused</Badge> : null}
              {event.source === 'RECORD' ? <Badge tone="neutral">from record</Badge> : null}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              <time dateTime={event.at} className="font-mono">
                {event.at.slice(0, 16).replace('T', ' ')} UTC
              </time>
              {event.actorName ? ` · ${event.actorName}` : ''}
              {event.actorRole ? ` (${event.actorRole.toLowerCase()})` : ''}
            </p>
            {event.reason ? <p className="mt-1 text-sm text-muted">&ldquo;{event.reason}&rdquo;</p> : null}
          </li>
        ))}
      </ol>

      {hasRecordOnly ? (
        <p className="mt-4 text-xs text-muted">
          Entries marked <span className="font-medium">from record</span> are read from the request or
          allocation itself. The sample history shipped with this demo does not include an audit entry
          for every one of those steps, so none has been invented here.
        </p>
      ) : null}
    </div>
  );
}
