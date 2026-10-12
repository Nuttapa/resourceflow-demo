import type { ResourcePool } from './types';

export interface RequestDraftItem {
  poolId: string;
  quantity: number;
}

export interface RequestDraft {
  title: string;
  purpose: string;
  items: RequestDraftItem[];
  durationDays: number;
}

export interface FieldError {
  /** "title", "purpose", "durationDays", or "items[0].quantity" */
  field: string;
  message: string;
}

export interface ValidationOutcome {
  ok: boolean;
  errors: FieldError[];
}

export const LIMITS = {
  titleMax: 120,
  purposeMin: 10,
  purposeMax: 500,
  durationMin: 1,
  durationMax: 365,
  maxItems: 8,
} as const;

const isPositiveInteger = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

/**
 * Validates a new request before anything is written. Pure, synchronous and
 * shared by the form (for inline messages) and by the workflow (as the real
 * gate), so a crafted call cannot bypass what the form enforces.
 */
export function validateRequestDraft(
  draft: RequestDraft,
  pools: readonly ResourcePool[],
): ValidationOutcome {
  const errors: FieldError[] = [];
  const title = (draft.title ?? '').trim();
  const purpose = (draft.purpose ?? '').trim();

  if (title.length === 0) {
    errors.push({ field: 'title', message: 'A short title is required.' });
  } else if (title.length > LIMITS.titleMax) {
    errors.push({ field: 'title', message: `Title must be ${LIMITS.titleMax} characters or fewer.` });
  }

  if (purpose.length === 0) {
    errors.push({ field: 'purpose', message: 'Describe what the resources are for.' });
  } else if (purpose.length < LIMITS.purposeMin) {
    errors.push({ field: 'purpose', message: `Purpose must be at least ${LIMITS.purposeMin} characters.` });
  } else if (purpose.length > LIMITS.purposeMax) {
    errors.push({ field: 'purpose', message: `Purpose must be ${LIMITS.purposeMax} characters or fewer.` });
  }

  if (!isPositiveInteger(draft.durationDays)) {
    errors.push({ field: 'durationDays', message: 'Duration must be a whole number of days greater than zero.' });
  } else if (draft.durationDays < LIMITS.durationMin || draft.durationDays > LIMITS.durationMax) {
    errors.push({
      field: 'durationDays',
      message: `Duration must be between ${LIMITS.durationMin} and ${LIMITS.durationMax} days.`,
    });
  }

  const items = Array.isArray(draft.items) ? draft.items : [];
  if (items.length === 0) {
    errors.push({ field: 'items', message: 'Add at least one resource.' });
  } else if (items.length > LIMITS.maxItems) {
    errors.push({ field: 'items', message: `A request may list at most ${LIMITS.maxItems} resources.` });
  }

  const seen = new Set<string>();
  items.forEach((item, index) => {
    const pool = pools.find((p) => p.id === item?.poolId);
    if (!pool) {
      errors.push({ field: `items[${index}].poolId`, message: 'Choose a resource pool.' });
      return;
    }
    if (seen.has(pool.id)) {
      errors.push({ field: `items[${index}].poolId`, message: `${pool.label} is listed more than once.` });
      return;
    }
    seen.add(pool.id);

    if (!isPositiveInteger(item.quantity)) {
      errors.push({
        field: `items[${index}].quantity`,
        message: `${pool.label} must be a whole number greater than zero.`,
      });
      return;
    }
    if (item.quantity > pool.total) {
      errors.push({
        field: `items[${index}].quantity`,
        message: `The cluster only has ${pool.total} ${pool.unit} of ${pool.label} in total.`,
      });
    }
  });

  return { ok: errors.length === 0, errors };
}
