/**
 * Domain model for the ResourceFlow portfolio demo.
 * Everything here is fictional, simulated data. No real system is involved.
 */

export const ROLES = ['REQUESTER', 'APPROVER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  REQUESTER: 'Student / Requester',
  APPROVER: 'Approver',
  ADMIN: 'Administrator',
};

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

export const RESOURCE_KINDS = ['VCPU', 'MEMORY_GB', 'STORAGE_GB', 'GPU'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface ResourcePool {
  id: string;
  kind: ResourceKind;
  label: string;
  unit: string;
  /** Total units the simulated cluster owns. */
  total: number;
  /**
   * Units already in use by workloads that pre-date this demo, i.e. consumption
   * that did NOT come from an Allocation record. Constant: the workflow never
   * changes it.
   *
   * Live usage is always derived, never stored twice:
   *   totalAllocated = baselineAllocated + sum(active allocations)
   *   available      = total - totalAllocated
   * See `lib/capacity.ts`, which is the single source of truth for these numbers.
   */
  baselineAllocated: number;
}

export const REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ALLOCATED',
  'RETURNED',
  'EXPIRED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const ALLOCATION_STATUSES = ['ALLOCATED', 'RETURNED', 'EXPIRED'] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export interface RequestItem {
  poolId: string;
  quantity: number;
}

export interface ResourceRequest {
  id: string;
  code: string;
  title: string;
  purpose: string;
  requesterId: string;
  items: RequestItem[];
  durationDays: number;
  status: RequestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionNote?: string;
}

export interface Allocation {
  id: string;
  requestId: string;
  items: RequestItem[];
  status: AllocationStatus;
  allocatedAt: string;
  allocatedBy: string;
  expiresAt: string;
  closedAt?: string;
  closedBy?: string;
}

export type AuditOutcome = 'ALLOWED' | 'DENIED';

export interface AuditEntry {
  id: string;
  at: string;
  /** Who attempted the action. Recorded for every state change and every denial. */
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: string;
  targetType: 'REQUEST' | 'ALLOCATION' | 'POOL' | 'DEMO';
  targetId: string;
  outcome: AuditOutcome;
  summary: string;
  reason?: string;
}

export interface DemoState {
  schemaVersion: number;
  users: DemoUser[];
  pools: ResourcePool[];
  requests: ResourceRequest[];
  allocations: Allocation[];
  auditLog: AuditEntry[];
  activeUserId: string;
}

/**
 * 1 -> 2: ResourcePool.allocated (a stored running total) was replaced by
 * ResourcePool.baselineAllocated, with live usage derived from allocations.
 * Stored v1 data is backed up and reseeded by `storage.loadState`.
 */
export const SCHEMA_VERSION = 2;
