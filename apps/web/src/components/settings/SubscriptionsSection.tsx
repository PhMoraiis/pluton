import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatBRL, type MonthlySeriesDTO, type TagDTO } from '@pluton/shared';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { knownTagIds } from '../../lib/entryDraft';
import { friendlyError } from '../../lib/errors';
import { invalidateEntryQueries } from '../../lib/entryMutations';
import { useCanWrite } from '../../lib/online';
import { queryKeys } from '../../lib/queryKeys';
import { btn, input } from './styles';

export function SubscriptionsSection() {
  const canWrite = useCanWrite();
  const client = useQueryClient();
  const [picked, setPicked] = useState('');

  const tags = useQuery({
    queryKey: queryKeys.tags(),
    queryFn: () => apiFetch<TagDTO[]>('/api/tags'),
  });
  const monthly = useQuery({
    queryKey: queryKeys.monthlySeries('EXPENSE'),
    queryFn: () => apiFetch<MonthlySeriesDTO[]>('/api/series/monthly?kind=EXPENSE'),
  });

  // Sempre por `system`, nunca pelo nome (o usuário pode renomear a etiqueta).
  const systemTagId = tags.data?.find((t) => t.system === 'SUBSCRIPTION')?.id ?? null;
  const all = monthly.data ?? [];
  const marked = systemTagId ? all.filter((s) => s.tagIds.includes(systemTagId)) : [];
  const candidates = systemTagId ? all.filter((s) => !s.tagIds.includes(systemTagId)) : [];
  const total = marked.reduce((sum, s) => sum + s.currentMonthCents, 0);

  // Etiqueta excluída ainda pode estar no cache da série; a API recusa id desconhecido.
  const knownIds = new Map((tags.data ?? []).map((t) => [t.id, t] as const));
  const setTags = useMutation({
    mutationFn: ({ id, tagIds }: { id: string; tagIds: string[] }) =>
      apiFetch<MonthlySeriesDTO>(`/api/series/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds }) }),
    onSuccess: () => invalidateEntryQueries(client),
  });

  const mark = () => {
    const s = candidates.find((c) => c.id === picked);
    if (!s || !systemTagId) return;
    setTags.mutate({ id: s.id, tagIds: [...knownTagIds(s.tagIds, knownIds), systemTagId] }, { onSuccess: () => setPicked('') });
  };
  const unmark = (s: MonthlySeriesDTO) => {
    if (!systemTagId) return;
    setTags.mutate({ id: s.id, tagIds: knownTagIds(s.tagIds, knownIds).filter((id) => id !== systemTagId) });
  };

  return (
    <section aria-label="Assinaturas" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">Assinaturas</h2>
      {(monthly.isError && !monthly.data) || (tags.isError && !tags.data) ? (
        <p role="alert" className="text-sm text-red-400">
          Não foi possível carregar as assinaturas.
        </p>
      ) : null}

      {marked.length === 0 ? (
        monthly.data && systemTagId ? <p className="text-sm text-muted">Nenhuma assinatura marcada.</p> : null
      ) : (
        <ul aria-label="Assinaturas marcadas" className="flex flex-col gap-1.5">
          {marked.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
              <span className="text-sm text-muted">{formatBRL(s.currentMonthCents)}</span>
              <button
                type="button"
                className={btn}
                disabled={!canWrite || setTags.isPending}
                aria-label={`Remover ${s.name} das assinaturas`}
                onClick={() => unmark(s)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {systemTagId && monthly.data && (
        <>
          <p className="text-sm font-medium text-ink">Total mensal {formatBRL(total)}</p>
          <div className="flex items-center gap-2 rounded-lg border border-line p-3">
            <label htmlFor="subscription-pick" className="sr-only">
              Marcar como assinatura
            </label>
            <select
              id="subscription-pick"
              className={`${input} min-w-0 flex-1`}
              value={picked}
              disabled={!canWrite || setTags.isPending}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">Selecione uma despesa mensal</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className={btn} disabled={!canWrite || setTags.isPending || !picked} onClick={mark}>
              Marcar
            </button>
          </div>
        </>
      )}
      {setTags.isError && (
        <p role="alert" className="text-sm text-red-400">
          {friendlyError(setTags.error)}
        </p>
      )}
    </section>
  );
}
