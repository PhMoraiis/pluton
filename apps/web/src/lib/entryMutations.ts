import { useMutation, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { DeleteScope, EditScope, EntryDTO, EntryKind, IsoDate, MonthKey } from '@pluton/shared';
import { apiFetch } from './api';
import type { EntriesKeyParams } from './queryKeys';

export interface CreateEntryInput {
  kind: EntryKind;
  name: string;
  amountCents: number;
  dueDate: IsoDate;
  paymentMethodId?: string | null;
  pixKey?: string;
  monthly?: boolean;
}

/** Campos editáveis de um lançamento (só os que mudaram). */
export interface EntryPatch {
  name?: string;
  amountCents?: number;
  dueDate?: IsoDate;
  paymentMethodId?: string | null;
  /** `null` (ou "") limpa a chave. */
  pixKey?: string | null;
  /** Conjunto completo de etiquetas (substitui o atual). */
  tagIds?: string[];
}

/** Depois de qualquer escrita: listas, atrasados, mês padrão, resumo, séries e salário (prefixo). */
export function invalidateEntryQueries(client: QueryClient): Promise<void> {
  return Promise.all(
    [['entries'], ['overdue'], ['default-month'], ['summary'], ['monthly-series'], ['salary']].map((queryKey) => client.invalidateQueries({ queryKey })),
  ).then(() => undefined);
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export function useCreateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEntryInput) => apiFetch<EntryDTO[]>('/api/entries', post(input)),
    onSuccess: () => void invalidateEntryQueries(client),
  });
}

export function useUpdateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope, patch }: { id: string; scope?: EditScope; patch: EntryPatch }) =>
      apiFetch<EntryDTO[]>(`/api/entries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(scope ? { scope, ...patch } : patch),
      }),
    onSuccess: () => void invalidateEntryQueries(client),
  });
}

export function useDeleteEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: DeleteScope }) =>
      apiFetch<void>(`/api/entries/${encodeURIComponent(id)}?scope=${scope}`, { method: 'DELETE' }),
    onSuccess: () => void invalidateEntryQueries(client),
  });
}

export function useEndSeries() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, lastMonth }: { seriesId: string; lastMonth: MonthKey }) =>
      apiFetch<void>(`/api/series/${encodeURIComponent(seriesId)}/end`, post({ lastMonth })),
    onSuccess: () => void invalidateEntryQueries(client),
  });
}

/** Listas que só mostram pendentes: a linha paga sai delas na hora. */
function isPendingList(queryKey: QueryKey): boolean {
  if (queryKey[0] === 'overdue') return true;
  return queryKey[0] === 'entries' && (queryKey[1] as EntriesKeyParams | undefined)?.status === 'pending';
}

/**
 * Pago/recebido. `paid: true` é otimista: remove a linha das listas de pendentes
 * antes da resposta e restaura tudo se a API falhar.
 */
export function usePayEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ entry, paid }: { entry: EntryDTO; paid: boolean }) =>
      apiFetch<EntryDTO>(`/api/entries/${encodeURIComponent(entry.id)}/pay`, post({ paid })),
    onMutate: async ({ entry, paid }) => {
      if (!paid) return { snapshot: [] as Array<[QueryKey, unknown]> };
      const filters = { predicate: (q: { queryKey: QueryKey }) => isPendingList(q.queryKey) };
      await client.cancelQueries(filters);
      const snapshot = client.getQueriesData<EntryDTO[]>(filters);
      client.setQueriesData<EntryDTO[]>(filters, (old) => old?.filter((e) => e.id !== entry.id));
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) client.setQueryData(key, data);
    },
    onSettled: () => void invalidateEntryQueries(client),
  });
}
