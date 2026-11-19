import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethodDTO } from '@pluton/shared';
import { useState, type FormEvent } from 'react';
import { MethodTag } from '../components/MethodTag';
import { Modal } from '../components/Modal';
import { apiFetch } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { useCanWrite } from '../lib/online';
import { PALETTE } from '../lib/palette';
import { queryKeys } from '../lib/queryKeys';
import { useSignOut } from '../lib/useSignOut';

const MAX_NAME = 60;
const btn =
  'rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';
const input =
  'rounded-md border border-line bg-transparent px-2 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40';

interface Draft {
  name: string;
  color: string;
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-1.5">
      {PALETTE.map((p) => {
        const selected = p.color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={p.color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={p.name}
            title={p.name}
            disabled={disabled}
            onClick={() => onChange(p.color)}
            style={{ backgroundColor: p.color }}
            className={`h-7 w-7 rounded-full border-2 disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'border-ink' : 'border-transparent'}`}
          />
        );
      })}
    </div>
  );
}

function MethodForm({
  initial,
  submitLabel,
  canWrite,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  canWrite: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: Draft) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const valid = draft.name.trim().length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || pending || !valid) return;
    onSubmit({ name: draft.name.trim(), color: draft.color });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-muted">
        Nome do método
        <input
          value={draft.name}
          maxLength={MAX_NAME}
          disabled={!canWrite}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={input}
        />
      </label>
      <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} disabled={!canWrite} />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!canWrite || pending || !valid} className={btn}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={btn}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export function SettingsPage() {
  const canWrite = useCanWrite();
  const client = useQueryClient();
  const { signOut, signingOut } = useSignOut();
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
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/payment-methods/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null);
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['entries'] })]);
    },
  });

  return (
    <section aria-label="Configurações" className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink">Configurações</h1>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">Métodos de pagamento</h2>
        {methods.isError && !methods.data && (
          <p role="alert" className="text-sm text-red-400">
            Não foi possível carregar os métodos.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {(methods.data ?? []).map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="min-w-0 flex-1">
                <MethodTag method={m} />
              </span>
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
          <MethodForm
            key={createKey}
            initial={{ name: '', color: PALETTE[0].color }}
            submitLabel="Adicionar"
            canWrite={canWrite}
            pending={create.isPending}
            error={create.isError ? friendlyError(create.error) : null}
            onSubmit={(d) => create.mutate(d)}
          />
        </div>
      </div>

      <div>
        <button type="button" onClick={signOut} disabled={!canWrite || signingOut} className={btn}>
          Sair
        </button>
      </div>

      {editing && (
        <Modal title="Editar método" onClose={() => setEditing(null)}>
          <MethodForm
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
