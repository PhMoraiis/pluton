import type { PaymentMethodDTO } from '@pluton/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { installmentHint, isPix, sortedMethods, type EntryDraft } from '../lib/entryDraft';
import { Modal } from './Modal';

interface Props {
  mode: 'create' | 'edit';
  initial: EntryDraft;
  methods: PaymentMethodDTO[];
  canWrite: boolean;
  saving?: boolean;
  error?: string | null;
  onSubmit: (draft: EntryDraft) => void;
  onCancel: () => void;
  /** Só na edição: ações extras do lançamento. */
  onDelete?: () => void;
  onEndSeries?: () => void;
}

const field = 'w-full rounded-md border border-line bg-bg px-2.5 py-2 text-sm text-ink';
const labelCls = 'flex flex-col gap-1 text-xs text-muted';

/** Formulário em folha (celular; também "Editar" na tabela): mesmos campos da nova linha. */
export function EntrySheet({
  mode,
  initial,
  methods,
  canWrite,
  saving = false,
  error,
  onSubmit,
  onCancel,
  onDelete,
  onEndSeries,
}: Props) {
  const [draft, setDraft] = useState(initial);
  const list = useMemo(() => sortedMethods(methods), [methods]);
  const byId = useMemo(() => new Map(list.map((m) => [m.id, m])), [list]);
  const hint = installmentHint(draft.name);
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canWrite && !saving) onSubmit(draft);
  }

  return (
    <Modal title={mode === 'create' ? 'Novo lançamento' : 'Editar lançamento'} onClose={onCancel} variant="sheet">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            Nome
            <input className={field} value={draft.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
          </label>
          {hint && <span className="text-xs text-accent">{hint}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Valor
            <input
              className={field}
              inputMode="decimal"
              placeholder="0,00"
              value={draft.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Vencimento
            <input type="date" className={field} value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </label>
        </div>
        <label className={labelCls}>
          Método
          <select className={field} value={draft.methodId} onChange={(e) => set('methodId', e.target.value)}>
            <option value="">Sem método</option>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {isPix(byId, draft.methodId) && (
          <label className={labelCls}>
            Chave Pix
            <input className={field} value={draft.pixKey} onChange={(e) => set('pixKey', e.target.value)} autoComplete="off" />
          </label>
        )}
        {mode === 'create' && !hint && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.monthly} onChange={(e) => set('monthly', e.target.checked)} />
            Mensal
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!canWrite || saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Salvar
          </button>
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-hover">
            Cancelar
          </button>
          {onEndSeries && (
            <button
              type="button"
              disabled={!canWrite}
              onClick={onEndSeries}
              className="ml-auto rounded-md px-3 py-2 text-sm text-muted hover:bg-hover disabled:opacity-50"
            >
              Encerrar série
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              disabled={!canWrite}
              onClick={onDelete}
              className={`${onEndSeries ? '' : 'ml-auto '}rounded-md px-3 py-2 text-sm text-danger hover:bg-hover disabled:opacity-50`}
            >
              Excluir
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
