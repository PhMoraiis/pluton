import { formatBRL, type Summary } from '@pluton/shared';

/** Três números do mês. Sem "realizado": isso só existe na análise por período. */
export function SummaryBar({ summary }: { summary: Summary | undefined }) {
  const items = [
    {
      label: 'Despesas',
      cents: summary?.expenseCents,
      split: summary
        ? `pago ${formatBRL(summary.expensePaidCents)} · a pagar ${formatBRL(summary.expenseCents - summary.expensePaidCents)}`
        : undefined,
    },
    {
      label: 'Ganhos',
      cents: summary?.incomeCents,
      split: summary
        ? `recebido ${formatBRL(summary.incomePaidCents)} · a receber ${formatBRL(summary.incomeCents - summary.incomePaidCents)}`
        : undefined,
    },
    { label: 'Ganhos − Despesas', cents: summary?.balanceCents, split: undefined },
  ];
  return (
    <dl aria-label="Resumo do mês" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {items.map(({ label, cents, split }) => (
        <div key={label} className="rounded-lg border border-line bg-surface px-4 py-3">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${cents != null && cents < 0 ? 'text-danger' : 'text-ink'}`}>
            {cents == null ? '—' : formatBRL(cents)}
          </dd>
          {split && <dd className="text-xs text-muted">{split}</dd>}
        </div>
      ))}
    </dl>
  );
}
