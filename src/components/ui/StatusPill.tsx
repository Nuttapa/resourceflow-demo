import { Badge, type BadgeTone } from './Badge';
import type { AllocationStatus, RequestStatus } from '@/lib/types';

type AnyStatus = RequestStatus | AllocationStatus;

const TONE: Record<RequestStatus, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'info',
  ALLOCATED: 'accent',
  RETURNED: 'success',
  EXPIRED: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

const LABEL: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  ALLOCATED: 'Allocated',
  RETURNED: 'Returned',
  EXPIRED: 'Expired',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function statusTone(status: AnyStatus): BadgeTone {
  return TONE[status as RequestStatus] ?? 'neutral';
}

export function statusLabel(status: AnyStatus): string {
  return LABEL[status as RequestStatus] ?? status;
}

/**
 * One pill for both request and allocation statuses - the two vocabularies
 * overlap, and showing them the same way keeps a request and its allocation
 * visually connected.
 */
export function StatusPill({ status, overdue = false }: { status: AnyStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
      {overdue ? <Badge tone="danger">Overdue</Badge> : null}
    </span>
  );
}
