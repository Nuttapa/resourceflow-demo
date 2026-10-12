import { formatQuantity, percentUsed } from '@/lib/format';
import type { PoolUsage } from '@/lib/capacity';

/** Purely presentational: it renders numbers it is given and computes nothing. */
export interface CapacityBarProps {
  usage: PoolUsage;
  /** Hide the numeric breakdown when the caller shows it elsewhere. */
  compact?: boolean;
}

/** Visual pressure level. Never the only signal - the percentage is always shown. */
function level(percent: number): { tone: string; label: string; bar: string } {
  if (percent >= 90) return { tone: 'text-danger', label: 'Nearly full', bar: 'bg-danger' };
  if (percent >= 75) return { tone: 'text-warning', label: 'Filling up', bar: 'bg-warning' };
  return { tone: 'text-success', label: 'Healthy', bar: 'bg-success' };
}

export function CapacityBar({ usage, compact = false }: CapacityBarProps) {
  const percent = percentUsed(usage.totalAllocated, usage.total);
  const baselineShare = percentUsed(usage.baselineAllocated, usage.total);
  const state = level(percent);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{usage.label}</p>
        <p className={`text-sm font-semibold tabular-nums ${state.tone}`}>
          {percent}% <span className="font-normal text-muted">used · {state.label}</span>
        </p>
      </div>

      <div
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${usage.label} capacity used`}
        aria-valuetext={`${percent} percent used, ${usage.available} of ${usage.total} ${usage.unit} available`}
        className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-elevated"
      >
        {/* Baseline first, then this demo's own allocations, so the two are distinguishable. */}
        <div className="h-full bg-muted/60" style={{ width: `${baselineShare}%` }} />
        <div className={`h-full ${state.bar}`} style={{ width: `${Math.max(0, percent - baselineShare)}%` }} />
      </div>

      {compact ? (
        <p className="mt-1.5 text-xs text-muted">
          {formatQuantity(usage.available, usage.unit)} free of {formatQuantity(usage.total, usage.unit)}
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">Total</dt>
            <dd className="font-medium tabular-nums">{formatQuantity(usage.total, usage.unit)}</dd>
          </div>
          <div>
            <dt className="text-muted">Baseline</dt>
            <dd className="font-medium tabular-nums">{formatQuantity(usage.baselineAllocated, usage.unit)}</dd>
          </div>
          <div>
            <dt className="text-muted">Demo allocations</dt>
            <dd className="font-medium tabular-nums">{formatQuantity(usage.activeAllocated, usage.unit)}</dd>
          </div>
          <div>
            <dt className="text-muted">Available</dt>
            <dd className="font-medium tabular-nums">{formatQuantity(usage.available, usage.unit)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
