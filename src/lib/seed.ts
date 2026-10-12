import type { Allocation, AuditEntry, DemoState, DemoUser, ResourcePool, ResourceRequest } from './types';
import { SCHEMA_VERSION } from './types';

/**
 * Fictional seed data. Every person, address and machine below is invented
 * for this portfolio demo; none of it comes from or refers to a real system.
 */

export const SEED_USERS: DemoUser[] = [
  { id: 'u-aree', name: 'Aree Boonmee', email: 'aree.b@example.com', role: 'REQUESTER', department: 'Computer Science, Year 4' },
  { id: 'u-kittipong', name: 'Kittipong S.', email: 'kittipong.s@example.com', role: 'REQUESTER', department: 'Computer Science, Year 3' },
  { id: 'u-nicha', name: 'Nicha Wattana', email: 'nicha.w@example.com', role: 'REQUESTER', department: 'Data Science, Year 4' },
  { id: 'u-pradit', name: 'Dr. Pradit Chaiyo', email: 'pradit.c@example.com', role: 'APPROVER', department: 'Faculty Advisor' },
  { id: 'u-sunee', name: 'Sunee Thongdee', email: 'sunee.t@example.com', role: 'APPROVER', department: 'Lab Supervisor' },
  { id: 'u-admin', name: 'Watcharin P.', email: 'watcharin.p@example.com', role: 'ADMIN', department: 'Infrastructure Team' },
];

export const SEED_POOLS: ResourcePool[] = [
  { id: 'pool-cpu', kind: 'VCPU', label: 'vCPU', unit: 'cores', total: 96, baselineAllocated: 14 },
  { id: 'pool-mem', kind: 'MEMORY_GB', label: 'Memory', unit: 'GB', total: 384, baselineAllocated: 24 },
  { id: 'pool-disk', kind: 'STORAGE_GB', label: 'Block storage', unit: 'GB', total: 8000, baselineAllocated: 1400 },
  { id: 'pool-gpu', kind: 'GPU', label: 'GPU', unit: 'cards', total: 6, baselineAllocated: 0 },
];

const T = (iso: string) => iso;

export const SEED_REQUESTS: ResourceRequest[] = [
  {
    id: 'req-1001', code: 'RF-1001', title: 'Senior project web server',
    purpose: 'Host the staging build of our senior project for the mid-term demo.',
    requesterId: 'u-aree',
    items: [{ poolId: 'pool-cpu', quantity: 4 }, { poolId: 'pool-mem', quantity: 16 }, { poolId: 'pool-disk', quantity: 200 }],
    durationDays: 60, status: 'ALLOCATED', createdAt: T('2026-09-02T03:10:00.000Z'),
    decidedAt: T('2026-09-03T02:40:00.000Z'), decidedBy: 'u-pradit', decisionNote: 'Scope and duration look reasonable.',
  },
  {
    id: 'req-1002', code: 'RF-1002', title: 'GPU node for image classification training',
    purpose: 'Fine-tune a vision model for the data mining course project.',
    requesterId: 'u-nicha',
    items: [{ poolId: 'pool-gpu', quantity: 2 }, { poolId: 'pool-cpu', quantity: 8 }, { poolId: 'pool-mem', quantity: 64 }],
    durationDays: 30, status: 'ALLOCATED', createdAt: T('2026-09-10T07:25:00.000Z'),
    decidedAt: T('2026-09-10T09:05:00.000Z'), decidedBy: 'u-sunee',
  },
  {
    id: 'req-1003', code: 'RF-1003', title: 'Database sandbox for coursework',
    purpose: 'Practice replication and backup exercises for the database systems course.',
    requesterId: 'u-kittipong',
    items: [{ poolId: 'pool-cpu', quantity: 2 }, { poolId: 'pool-mem', quantity: 8 }, { poolId: 'pool-disk', quantity: 100 }],
    durationDays: 14, status: 'PENDING', createdAt: T('2026-10-05T04:00:00.000Z'),
  },
  {
    id: 'req-1004', code: 'RF-1004', title: 'Load-testing cluster',
    purpose: 'Run k6 load tests against the team API before the final presentation.',
    requesterId: 'u-aree',
    items: [{ poolId: 'pool-cpu', quantity: 12 }, { poolId: 'pool-mem', quantity: 32 }],
    durationDays: 7, status: 'PENDING', createdAt: T('2026-10-08T06:30:00.000Z'),
  },
  {
    id: 'req-1005', code: 'RF-1005', title: 'Lab teaching VM for next term',
    purpose: 'Prepare a shared VM image for the operating systems lab.',
    requesterId: 'u-sunee',
    items: [{ poolId: 'pool-cpu', quantity: 6 }, { poolId: 'pool-mem', quantity: 24 }, { poolId: 'pool-disk', quantity: 300 }],
    durationDays: 90, status: 'PENDING', createdAt: T('2026-10-09T02:15:00.000Z'),
  },
  {
    id: 'req-1006', code: 'RF-1006', title: 'Private crypto-mining rig',
    purpose: 'Personal side project, not coursework.',
    requesterId: 'u-kittipong',
    items: [{ poolId: 'pool-gpu', quantity: 4 }],
    durationDays: 180, status: 'REJECTED', createdAt: T('2026-09-18T08:45:00.000Z'),
    decidedAt: T('2026-09-18T10:00:00.000Z'), decidedBy: 'u-pradit',
    decisionNote: 'Outside the acceptable-use policy for shared academic resources.',
  },
  {
    id: 'req-1007', code: 'RF-1007', title: 'Short-lived CI runner',
    purpose: 'Temporary build agent during the integration sprint.',
    requesterId: 'u-nicha',
    items: [{ poolId: 'pool-cpu', quantity: 4 }, { poolId: 'pool-mem', quantity: 8 }],
    durationDays: 10, status: 'RETURNED', createdAt: T('2026-08-12T01:00:00.000Z'),
    decidedAt: T('2026-08-12T03:30:00.000Z'), decidedBy: 'u-pradit',
  },
];

export const SEED_ALLOCATIONS: Allocation[] = [
  {
    id: 'alloc-2001', requestId: 'req-1001',
    items: [{ poolId: 'pool-cpu', quantity: 4 }, { poolId: 'pool-mem', quantity: 16 }, { poolId: 'pool-disk', quantity: 200 }],
    status: 'ALLOCATED', allocatedAt: T('2026-09-03T04:00:00.000Z'), allocatedBy: 'u-admin',
    expiresAt: T('2026-11-02T04:00:00.000Z'),
  },
  {
    id: 'alloc-2002', requestId: 'req-1002',
    items: [{ poolId: 'pool-gpu', quantity: 2 }, { poolId: 'pool-cpu', quantity: 8 }, { poolId: 'pool-mem', quantity: 64 }],
    status: 'ALLOCATED', allocatedAt: T('2026-09-11T01:20:00.000Z'), allocatedBy: 'u-admin',
    expiresAt: T('2026-10-11T01:20:00.000Z'),
  },
  {
    id: 'alloc-2003', requestId: 'req-1007',
    items: [{ poolId: 'pool-cpu', quantity: 4 }, { poolId: 'pool-mem', quantity: 8 }],
    status: 'RETURNED', allocatedAt: T('2026-08-12T05:00:00.000Z'), allocatedBy: 'u-admin',
    expiresAt: T('2026-08-22T05:00:00.000Z'),
    closedAt: T('2026-08-20T07:30:00.000Z'), closedBy: 'u-nicha',
  },
];

export const SEED_AUDIT: AuditEntry[] = [
  { id: 'aud-1', at: T('2026-09-02T03:10:00.000Z'), actorId: 'u-aree', actorName: 'Aree Boonmee', actorRole: 'REQUESTER', action: 'request:create', targetType: 'REQUEST', targetId: 'req-1001', outcome: 'ALLOWED', summary: 'Submitted RF-1001' },
  { id: 'aud-2', at: T('2026-09-03T02:40:00.000Z'), actorId: 'u-pradit', actorName: 'Dr. Pradit Chaiyo', actorRole: 'APPROVER', action: 'request:decide', targetType: 'REQUEST', targetId: 'req-1001', outcome: 'ALLOWED', summary: 'Approved RF-1001' },
  { id: 'aud-3', at: T('2026-09-03T04:00:00.000Z'), actorId: 'u-admin', actorName: 'Watcharin P.', actorRole: 'ADMIN', action: 'allocation:create', targetType: 'ALLOCATION', targetId: 'alloc-2001', outcome: 'ALLOWED', summary: 'Allocated resources for RF-1001' },
  { id: 'aud-4', at: T('2026-09-18T10:00:00.000Z'), actorId: 'u-pradit', actorName: 'Dr. Pradit Chaiyo', actorRole: 'APPROVER', action: 'request:decide', targetType: 'REQUEST', targetId: 'req-1006', outcome: 'ALLOWED', summary: 'Rejected RF-1006', reason: 'Outside the acceptable-use policy for shared academic resources.' },
  { id: 'aud-5', at: T('2026-08-20T07:30:00.000Z'), actorId: 'u-nicha', actorName: 'Nicha Wattana', actorRole: 'REQUESTER', action: 'allocation:return', targetType: 'ALLOCATION', targetId: 'alloc-2003', outcome: 'ALLOWED', summary: 'Returned allocation for RF-1007' },
];

/** A fresh, independent copy of the default demo state. */
export function createSeedState(): DemoState {
  return structuredClone({
    schemaVersion: SCHEMA_VERSION,
    users: SEED_USERS,
    pools: SEED_POOLS,
    requests: SEED_REQUESTS,
    allocations: SEED_ALLOCATIONS,
    auditLog: SEED_AUDIT,
    activeUserId: 'u-aree',
  } satisfies DemoState);
}
