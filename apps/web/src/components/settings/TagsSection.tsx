import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TagDTO } from '@pluton/shared';
import { useState } from 'react';
import { Modal } from '../Modal';
import { apiFetch } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { useCanWrite } from '../../lib/online';
import { PALETTE } from '../../lib/palette';
import { queryKeys } from '../../lib/queryKeys';
import { NameColorForm, type Draft } from './NameColorForm';
import { btn } from './styles';

const MAX_NAME = 40;
const OVERRIDES = { duplicate_name: 'Já existe uma etiqueta com esse nome.' };

export function TagsSection() {
  const canWrite = useCanWrite();
  const client = useQueryClient();
  const [editing, setEditing] = useState<TagDTO | null>(null);
  const [deleting, setDeleting] = useState<TagDTO | null>(null);
  const [createKey, setCreateKey] = useState(0);

  const tags = useQuery({
    queryKey: queryKeys.tags(),
    queryFn: () => apiFetch<TagDTO[]>('/api/tags'),
  });

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.tags() }),
      client.invalidateQueries({ queryKey: ['entries'] }),
    ]);

  const create = useMutation({
    mutationFn: (d: Draft) => apiFetch<TagDTO>('/api/tags', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: async () => {
      setCreateKey((k) => k + 1);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...d }: Draft & { id: string }) =>
      apiFetch<TagDTO>(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/tags/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });

  return (
    <section aria-label="Etiquetas" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">Etiquetas</h2>
      {tags.isError && !tags.data && (
        <p role="alert" className="text-sm text-red-400">
          Não foi possível carregar as etiquetas.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {(tags.data ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>
                <span
                  className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${t.color}33`, color: t.color }}
                >
                  {t.name}
                </span>
              </span>
              {t.system && <span className="text-xs text-muted">Usada na tela Assinaturas</span>}
            </span>
            <button
              type="button"
              className={btn}
              disabled={!canWrite}
              aria-label={`Editar ${t.name}`}
              onClick={() => {
                update.reset();
                setEditing(t);
              }}
            >
              Editar
            </button>
            {!t.system && (
              <button
                type="button"
                className={btn}
                disabled={!canWrite}
                aria-label={`Excluir ${t.name}`}
                onClick={() => {
                  remove.reset();
                  setDeleting(t);
                }}
              >
                Excluir
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-line p-3">
        <h3 className="mb-2 text-sm font-medium text-ink">Nova etiqueta</h3>
        <NameColorForm
          key={createKey}
          initial={{ name: '', color: PALETTE[0].color }}
          nameLabel="Nome da etiqueta"
          maxLength={MAX_NAME}
          submitLabel="Adicionar etiqueta"
          canWrite={canWrite}
          pending={create.isPending}
          error={create.isError ? friendlyError(create.error, OVERRIDES) : null}
          onSubmit={(d) => create.mutate(d)}
        />
      </div>

      {editing && (
        <Modal title="Editar etiqueta" onClose={() => setEditing(null)}>
          <NameColorForm
            initial={{ name: editing.name, color: editing.color }}
            nameLabel="Nome da etiqueta"
            maxLength={MAX_NAME}
            submitLabel="Salvar"
            canWrite={canWrite}
            pending={update.isPending}
            error={update.isError ? friendlyError(update.error, OVERRIDES) : null}
            onSubmit={(d) => update.mutate({ id: editing.id, ...d })}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title={`Excluir "${deleting.name}"?`} onClose={() => setDeleting(null)}>
          <p className="mb-3 text-sm text-muted">Os lançamentos com esta etiqueta ficarão sem ela.</p>
          {remove.isError && (
            <p role="alert" className="mb-2 text-sm text-red-400">
              {friendlyError(remove.error)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={btn}
              disabled={!canWrite || remove.isPending}
              onClick={() => remove.mutate(deleting.id)}
            >
              Excluir
            </button>
            <button type="button" className={btn} onClick={() => setDeleting(null)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
