import { useQuery } from '@tanstack/react-query';
import { formatBRL, monthKeyOf, todayInSaoPaulo, type MonthKey, type Summary } from '@pluton/shared';
import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const input = 'rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-ink';

export function PeriodPage() {
  const current = monthKeyOf(todayInSaoPaulo());
  const [from, setFrom] = useState<MonthKey>(`${current.slice(0, 4)}-01`);
  const [to, setTo] = useState<MonthKey>(current);

  const complete = MONTH_RE.test(from) && MONTH_RE.test(to);
  const inverted = complete && from > to;
  const summary = useQuery({
    queryKey: queryKeys.summary(from, to),
    queryFn: () => apiFetch<Summary>(`/api/summary?${new URLSearchParams({ from, to })}`),
    enabled: complete && !inverted,
  });

  const data = complete && !inverted ? summary.data : undefined;
  const items = [
    { label: 'Despesas', cents: data?.expenseCents },
    { label: 'Ganhos', cents: data?.incomeCents },
    { label: 'Ganhos − Despesas', cents: data?.balanceCents },
    { label: 'Realizado', cents: data?.realizedCents },
  ];

  return (
    <section aria-label="Período" className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-ink">Período</h1>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Início
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Fim
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
      </div>

      {!complete ? (
        <p role="alert" className="text-sm text-danger">
          Escolha o mês inicial e o final.
        </p>
      ) : inverted ? (
        <p role="alert" className="text-sm text-danger">
          O mês inicial não pode ser depois do mês final.
        </p>
      ) : (
        summary.isError &&
        !summary.data && (
          <p role="alert" className="text-sm text-danger">
            Não foi possível carregar o resumo do período.
          </p>
        )
      )}
      {summary.isError && summary.data && complete && !inverted && (
        <p role="status" className="text-xs text-muted">
          Mostrando dados salvos
        </p>
      )}

      <dl aria-label="Resumo do período" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ label, cents }) => (
          <div key={label} className="rounded-lg border border-line bg-surface px-4 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${cents != null && cents < 0 ? 'text-danger' : 'text-ink'}`}>
              {cents == null ? '—' : formatBRL(cents)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
