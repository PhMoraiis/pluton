import { useQuery } from '@tanstack/react-query';
import {
  monthKeyOf,
  todayInSaoPaulo,
  type EntryDTO,
  type EntryKind,
  type MonthKey,
  type PaymentMethodDTO,
  type Summary,
} from '@pluton/shared';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EntriesFooter } from '../components/EntriesFooter';
import { EntriesTable } from '../components/EntriesTable';
import { EntryCards } from '../components/EntryCards';
import { MonthPicker, PENDING_ALL, type MonthSelection } from '../components/MonthPicker';
import { SummaryBar } from '../components/SummaryBar';
import { apiFetch } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useIsDesktop } from '../lib/useMediaQuery';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function List({
  rows,
  methods,
  overdue,
  caption,
}: {
  rows: EntryDTO[];
  methods: Map<string, PaymentMethodDTO>;
  overdue?: boolean;
  caption: string;
}) {
  const desktop = useIsDesktop();
  return desktop ? (
    <EntriesTable rows={rows} methods={methods} overdue={overdue} caption={caption} />
  ) : (
    <EntryCards rows={rows} methods={methods} overdue={overdue} />
  );
}

export function EntriesPage({ kind }: { kind: EntryKind }) {
  const [params, setParams] = useSearchParams();
  const mesParam = params.get('mes');
  const explicit: MonthSelection | null =
    mesParam === PENDING_ALL ? PENDING_ALL : mesParam && MONTH_RE.test(mesParam) ? mesParam : null;

  const defaultMonth = useQuery({
    queryKey: queryKeys.defaultMonth(kind),
    queryFn: () => apiFetch<{ month: MonthKey }>(`/api/default-month?kind=${kind}`),
    enabled: explicit === null,
  });
  const selection: MonthSelection | null = explicit ?? defaultMonth.data?.month ?? null;
  const allPending = selection === PENDING_ALL;
  const month: MonthKey | null = selection && !allPending ? selection : null;

  const entries = useQuery({
    queryKey: queryKeys.entries({
      kind,
      from: month ?? undefined,
      to: month ?? undefined,
      status: 'pending',
    }),
    queryFn: () => {
      const q = new URLSearchParams({ kind });
      if (month) {
        q.set('from', month);
        q.set('to', month);
      }
      q.set('status', 'pending');
      return apiFetch<EntryDTO[]>(`/api/entries?${q}`);
    },
    enabled: selection !== null,
  });

  const overdue = useQuery({
    queryKey: queryKeys.overdue(kind),
    queryFn: () => apiFetch<EntryDTO[]>(`/api/entries/overdue?kind=${kind}`),
  });

  const summary = useQuery({
    queryKey: queryKeys.summary(month ?? '', month ?? ''),
    queryFn: () => apiFetch<Summary>(`/api/summary?from=${month}&to=${month}`),
    enabled: month !== null,
  });

  const methodsQuery = useQuery({
    queryKey: queryKeys.paymentMethods(),
    queryFn: () => apiFetch<PaymentMethodDTO[]>('/api/payment-methods'),
  });
  const methodList = methodsQuery.data;
  const methods = useMemo(() => new Map((methodList ?? []).map((m) => [m.id, m])), [methodList]);

  const [methodFilter, setMethodFilter] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');

  const overdueRows = overdue.data ?? [];
  const rows = useMemo(() => {
    const overdueIds = new Set((overdue.data ?? []).map((e) => e.id));
    const needle = search.trim().toLocaleLowerCase('pt-BR');
    return (entries.data ?? []).filter(
      (e) =>
        !overdueIds.has(e.id) &&
        (methodFilter.size === 0 || (e.paymentMethodId != null && methodFilter.has(e.paymentMethodId))) &&
        (needle === '' || e.displayName.toLocaleLowerCase('pt-BR').includes(needle)),
    );
  }, [entries.data, overdue.data, methodFilter, search]);

  function selectMonth(next: MonthSelection) {
    setParams({ mes: next }, { replace: true });
  }

  function toggleMethod(id: string) {
    setMethodFilter((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const loadError = entries.error ?? defaultMonth.error;
  const title = kind === 'EXPENSE' ? 'despesas' : 'ganhos';

  return (
    <section aria-label={`Lançamentos de ${title}`} className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-ink">{kind === 'EXPENSE' ? 'Despesas' : 'Ganhos'}</h1>
      {selection && (
        <MonthPicker
          value={selection}
          baseMonth={month ?? defaultMonth.data?.month ?? monthKeyOf(todayInSaoPaulo())}
          onChange={selectMonth}
        />
      )}

      {month && <SummaryBar summary={summary.data} />}

      {overdueRows.length > 0 && (
        <section aria-label="Atrasados" className="rounded-lg border border-danger/40 p-2">
          <h2 className="px-2 pb-1 text-sm font-medium text-danger">Atrasados</h2>
          <List rows={overdueRows} methods={methods} overdue caption="Lançamentos atrasados" />
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Buscar por nome"
          placeholder="Buscar por nome"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-line bg-surface px-2.5 py-1 text-sm text-ink placeholder:text-muted"
        />
        {methodList && methodList.length > 0 && (
          <div role="group" aria-label="Método de pagamento" className="flex flex-wrap gap-1.5">
            {methodList.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={methodFilter.has(m.id)}
                onClick={() => toggleMethod(m.id)}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:bg-hover aria-pressed:bg-hover aria-pressed:text-ink"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loadError ? (
        <p role="alert" className="text-sm text-danger">
          Não foi possível carregar os lançamentos.
        </p>
      ) : entries.data ? (
        <div>
          {rows.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">Nenhum lançamento pendente.</p>
          ) : (
            <List rows={rows} methods={methods} caption={`Lançamentos de ${title}`} />
          )}
          <EntriesFooter rows={rows} />
        </div>
      ) : (
        <p className="px-2 py-4 text-sm text-muted">Carregando…</p>
      )}
    </section>
  );
}
