import type { EntryDTO } from '@pluton/shared';

/** Etiqueta visual dos lançamentos gerados pela série de salário. */
export function SalaryBadge({ entry }: { entry: EntryDTO }) {
  if (entry.seriesRole !== 'SALARY') return null;
  const label = entry.paidOn ? 'Salário' : entry.amountAdjusted ? 'Salário · ajustado' : 'Salário · estimado';
  return (
    <span className="inline-block shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-500">
      {label}
    </span>
  );
}
