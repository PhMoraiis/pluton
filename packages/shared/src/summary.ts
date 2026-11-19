import type { EntryDTO, Summary } from './types';

/**
 * Totaliza os lançamentos já filtrados pelo período de vencimento (o chamador
 * faz o filtro). Valores em centavos inteiros.
 */
export function summarize(
  entries: Array<Pick<EntryDTO, 'kind' | 'amountCents' | 'paidOn'>>,
): Summary {
  let expenseCents = 0;
  let incomeCents = 0;
  let realizedCents = 0;

  for (const entry of entries) {
    const isPaid = entry.paidOn !== null;
    if (entry.kind === 'EXPENSE') {
      expenseCents += entry.amountCents;
      if (isPaid) realizedCents -= entry.amountCents;
    } else {
      incomeCents += entry.amountCents;
      if (isPaid) realizedCents += entry.amountCents;
    }
  }

  return {
    expenseCents,
    incomeCents,
    balanceCents: incomeCents - expenseCents,
    realizedCents,
  };
}
