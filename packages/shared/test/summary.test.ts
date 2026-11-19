import { expect, test } from 'vitest';
import { summarize } from '../src/summary';

test('summarize totals expenses and income, with realized amounts only for paid entries', () => {
  const entries = [
    { kind: 'EXPENSE' as const, amountCents: 63000, paidOn: '2026-11-05' },
    { kind: 'EXPENSE' as const, amountCents: 4290, paidOn: null },
    { kind: 'EXPENSE' as const, amountCents: 700, paidOn: '2026-11-10' },
    { kind: 'INCOME' as const, amountCents: 500000, paidOn: '2026-11-03' },
    { kind: 'INCOME' as const, amountCents: 100000, paidOn: null },
  ];

  expect(summarize(entries)).toEqual({
    expenseCents: 67990,
    incomeCents: 600000,
    balanceCents: 532010,
    realizedCents: 436300,
  });
});

test('summarize of an empty list is all zeros', () => {
  expect(summarize([])).toEqual({
    expenseCents: 0,
    incomeCents: 0,
    balanceCents: 0,
    realizedCents: 0,
  });
});
