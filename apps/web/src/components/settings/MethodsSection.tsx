import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethodDTO } from '@pluton/shared';
import { useState } from 'react';
import { MethodTag } from '../MethodTag';
import { Modal } from '../Modal';
import { apiFetch } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { useCanWrite } from '../../lib/online';
import { PALETTE } from '../../lib/palette';
import { queryKeys } from '../../lib/queryKeys';
import { NameColorForm, type Draft } from './NameColorForm';
import { btn } from './styles';

const MAX_NAME = 60;

export function MethodsSection() {
  const canWrite = useCanWrite();
  const client = useQueryClient();
  const [editing, setEditing] = useState<PaymentMethodDTO | null>(null);
  const [deleting, setDeleting] = useState<PaymentMethodDTO | null>(null);
  const [createKey, setCreateKey] = useState(0);

  const methods = useQuery({
    queryKey: queryKeys.paymentMethods(),
    queryFn: () => apiFetch<PaymentMethodDTO[]>('/api/payment-methods'),
  });

  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.paymentMethods() });

  const create = useMutation({
    mutationFn: (d: Draft) =>
      apiFetch<PaymentMethodDTO>('/api/payment-methods', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: async () => {
      setCreateKey((k) => k + 1);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...d }: Draft & { id: string }) =>
      apiFetch<PaymentMethodDTO>(`/api/payment-methods/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const charge = useMutation({
    mutationFn: ({ m, chargeNextMonth }: { m: PaymentMethodDTO; chargeNextMonth: boolean }) =>
      apiFetch<PaymentMethodDTO>(`/api/payment-methods/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: m.name, color: m.color, chargeNextMonth }),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/payment-methods/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null);
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['entries'] })]);
    },
  });

  return (
    <section aria-label="Métodos de pagamento" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">Métodos de pagamento</h2>
      {methods.isError && !methods.data && (
        <p role="alert" className="text-sm text-red-400">
          Não foi possível carregar os métodos.
        </p>
      )}
      {charge.isError && (
        <p role="alert" className="text-sm text-red-400">
          {friendlyError(charge.error)}
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {(methods.data ?? []).map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <span className="min-w-0 flex-1">
              <MethodTag method={m} />
            </span>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                aria-label={`Cobrar ${m.name} no mês seguinte`}
                checked={m.chargeNextMonth ?? false}
                disabled={!canWrite || charge.isPending}
                onChange={(e) => charge.mutate({ m, chargeNextMonth: e.target.checked })}
              />
              Cobrar no mês seguinte
            </label>
            <button
              type="button"
              className={btn}
              disabled={!canWrite}
              aria-label={`Editar ${m.name}`}
              onClick={() => {
                update.reset();
                setEditing(m);
              }}
            >
              Editar
            </button>
            <button
              type="button"
              className={btn}
              disabled={!canWrite}
              aria-label={`Excluir ${m.name}`}
              onClick={() => {
                remove.reset();
                setDeleting(m);
              }}
            >
              Excluir
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-lg border border-line p-3">
        <h3 className="mb-2 text-sm font-medium text-ink">Novo método</h3>
        <NameColorForm
          nameLabel="Nome do método"
          maxLength={MAX_NAME}
          key={createKey}
          initial={{ name: '', color: PALETTE[0].color }}
          submitLabel="Adicionar"
          canWrite={canWrite}
          pending={create.isPending}
          error={create.isError ? friendlyError(create.error) : null}
          onSubmit={(d) => create.mutate(d)}
        />
      </div>

      {editing && (
        <Modal title="Editar método" onClose={() => setEditing(null)}>
          <NameColorForm
            nameLabel="Nome do método"
            maxLength={MAX_NAME}
            initial={{ name: editing.name, color: editing.color }}
            submitLabel="Salvar"
            canWrite={canWrite}
            pending={update.isPending}
            error={update.isError ? friendlyError(update.error) : null}
            onSubmit={(d) => update.mutate({ id: editing.id, ...d })}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
      {deleting && (
        <Modal title={`Excluir "${deleting.name}"?`} onClose={() => setDeleting(null)}>
          <p className="mb-3 text-sm text-muted">Os lançamentos com este método ficarão sem método.</p>
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
