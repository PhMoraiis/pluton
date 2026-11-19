import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  addMonthsToKey,
  formatBRL,
  monthKeyOf,
  todayInSaoPaulo,
  type EntryDTO,
  type EntryKind,
  type MonthKey,
  type PaymentMethodDTO,
} from '@pluton/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MethodTag } from '../components/MethodTag';
import { apiFetch } from '../lib/api';
import { usePayEntry } from '../lib/entryMutations';
import { friendlyError } from '../lib/errors';
import { useCanWrite } from '../lib/online';
import { queryKeys } from '../lib/queryKeys';
import { useIsDesktop } from '../lib/useMediaQuery';

const PAGE_MONTHS = 6;
const SHORT_MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** "2026-11" → "nov. de 2026" (tabela fixa: não depende da versão do ICU). */
export function shortMonthLabel(key: MonthKey): string {
  const [year, month] = key.split('-');
  return `${SHORT_MONTHS[Number(month) - 1]} de ${year}`;
}

interface Column {
  month: MonthKey;
  entries: EntryDTO[];
  totalCents: number;
}

function HistoryCard({
  entry,
  method,
  canWrite,
  onError,
}: {
  entry: EntryDTO;
  method: PaymentMethodDTO | undefined;
  canWrite: boolean;
  onError: (message: string) => void;
}) {
  const pay = usePayEntry();
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2">
      <input
        type="checkbox"
        checked
        aria-label={`Desmarcar pago: ${entry.displayName}`}
        disabled={!canWrite || pay.isPending}
        onChange={() =>
          pay.mutate({ entry, paid: false }, { onError: (error) => onError(friendlyError(error)) })
        }
        className="mt-1"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm text-ink">{entry.displayName}</span>
        <span className="text-sm font-medium tabular-nums text-ink">{formatBRL(entry.amountCents)}</span>
        <MethodTag method={entry.paymentMethodId ? method : undefined} />
      </div>
    </li>
  );
}

export function HistoryPage() {
  const [kind, setKind] = useState<EntryKind>('EXPENSE');
  const current = monthKeyOf(todayInSaoPaulo());
  const [months, setMonths] = useState(PAGE_MONTHS);
  const [mobileMonth, setMobileMonth] = useState<MonthKey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const from = addMonthsToKey(current, -(months - 1));
  const canWrite = useCanWrite();
  const desktop = useIsDesktop();

  const entries = useQuery({
    queryKey: queryKeys.entries({ kind, from, status: 'paid' }),
    queryFn: () => apiFetch<EntryDTO[]>(`/api/entries?${new URLSearchParams({ kind, from, status: 'paid' })}`),
    placeholderData: keepPreviousData,
  });
  const methodsQuery = useQuery({
    queryKey: queryKeys.paymentMethods(),
    queryFn: () => apiFetch<PaymentMethodDTO[]>('/api/payment-methods'),
  });
  const methods = useMemo(() => new Map((methodsQuery.data ?? []).map((m) => [m.id, m])), [methodsQuery.data]);

  // Agrupa pelo mês do VENCIMENTO. Sem `to`, pagas adiantadas de meses futuros também aparecem.
  const columns = useMemo<Column[]>(() => {
    const byMonth = new Map<MonthKey, EntryDTO[]>();
    for (const e of entries.data ?? []) {
      const key = monthKeyOf(e.dueDate);
      byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
    }
    const last = [...byMonth.keys(), current].reduce((a, b) => (a > b ? a : b));
    const result: Column[] = [];
    for (let m = from; m <= last; m = addMonthsToKey(m, 1)) {
      const list = (byMonth.get(m) ?? []).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      result.push({ month: m, entries: list, totalCents: list.reduce((s, e) => s + e.amountCents, 0) });
    }
    return result;
  }, [entries.data, from, current]);

  // Desktop: começa rolado até a coluna mais recente (direita).
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!desktop || !entries.data || scrolled.current || !scroller.current) return;
    scroller.current.scrollLeft = scroller.current.scrollWidth;
    scrolled.current = true;
  }, [desktop, entries.data]);

  const stale = [entries, methodsQuery].some((q) => q.isError && q.data !== undefined);
  const loadError = !entries.data && entries.error;

  const lastMonth = columns[columns.length - 1]!.month;
  const shown = mobileMonth && columns.some((c) => c.month === mobileMonth) ? mobileMonth : lastMonth;
  const shownIndex = columns.findIndex((c) => c.month === shown);
  const visible = desktop ? columns : columns.filter((c) => c.month === shown);

  function loadMore() {
    setMonths((n) => n + PAGE_MONTHS);
  }
  function step(delta: number) {
    const target = columns[shownIndex + delta];
    if (target) setMobileMonth(target.month);
    else if (delta < 0) loadMore();
  }

  return (
    <section aria-label="Histórico" className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-ink">Histórico</h1>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Tipo" className="flex gap-1.5">
          {(['EXPENSE', 'INCOME'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setMobileMonth(null);
              }}
              className="rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:bg-hover aria-pressed:bg-hover aria-pressed:text-ink"
            >
              {k === 'EXPENSE' ? 'Despesas' : 'Ganhos'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={loadMore}
          className="rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:bg-hover hover:text-ink"
        >
          Carregar mais
        </button>
        {!desktop && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => step(-1)}
              className="rounded-md px-2 py-1 text-muted hover:bg-hover hover:text-ink"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Mês seguinte"
              disabled={shownIndex >= columns.length - 1}
              onClick={() => step(1)}
              className="rounded-md px-2 py-1 text-muted hover:bg-hover hover:text-ink disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {stale && (
        <p role="status" className="text-xs text-muted">
          Mostrando dados salvos
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="text-sm text-danger">
          Não foi possível carregar o histórico.
        </p>
      ) : entries.data ? (
        <div ref={scroller} className="flex gap-4 overflow-x-auto pb-2">
          {visible.map((col) => (
            <section
              key={col.month}
              aria-label={shortMonthLabel(col.month)}
              className="flex w-full shrink-0 flex-col gap-2 md:w-64"
            >
              <header className="flex items-baseline justify-between gap-2 border-b border-line pb-1">
                <h2 className="text-sm font-medium text-ink">{shortMonthLabel(col.month)}</h2>
                <span className="text-sm font-semibold tabular-nums text-ink">{formatBRL(col.totalCents)}</span>
              </header>
              {col.entries.length === 0 ? (
                <p className="text-xs text-muted">Nenhum lançamento pago.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {col.entries.map((e) => (
                    <HistoryCard
                      key={e.id}
                      entry={e}
                      method={e.paymentMethodId ? methods.get(e.paymentMethodId) : undefined}
                      canWrite={canWrite}
                      onError={setActionError}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : (
        <p className="px-2 py-4 text-sm text-muted">Carregando…</p>
      )}
    </section>
  );
}
