import type { EntryKind, MonthKey } from '@pluton/shared';

export type EntryStatusFilter = 'pending' | 'paid' | 'all';

export interface EntriesKeyParams {
  kind: EntryKind;
  from?: MonthKey;
  to?: MonthKey;
  status: EntryStatusFilter;
}

/** Convenção compartilhada de chaves do TanStack Query. */
export const queryKeys = {
  entries: (p: EntriesKeyParams) => ['entries', p] as const,
  overdue: (kind: EntryKind) => ['overdue', kind] as const,
  defaultMonth: (kind: EntryKind) => ['default-month', kind] as const,
  summary: (from: MonthKey, to: MonthKey) => ['summary', from, to] as const,
  paymentMethods: () => ['payment-methods'] as const,
};
