import type { PaymentMethodDTO, TagDTO } from '@pluton/shared';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  installmentHint,
  isPix,
  maskAmount,
  MAX_NAME_LENGTH,
  MAX_PIX_KEY_LENGTH,
  setChargeNextMonth,
  sortedMethods,
  withCreateMethod,
  withDueDate,
  withMethod,
  type EntryDraft,
} from '../lib/entryDraft';
import { ChargeMonthToggle } from './ChargeMonthToggle';
import { Modal } from './Modal';
import { TagPicker } from './TagPicker';

interface Props {
  mode: 'create' | 'edit';
  initial: EntryDraft;
  methods: PaymentMethodDTO[];
  /** Etiquetas do usuário; a seção só aparece na edição e com ao menos uma. */
  tags?: TagDTO[];
  canWrite: boolean;
  saving?: boolean;
  error?: string | null;
  /** Pode devolver a promessa do salvamento: até ela terminar, novos envios são ignorados. */
  onSubmit: (draft: EntryDraft) => void | Promise<unknown>;
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
  tags = [],
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

  // Trava síncrona: dois toques seguidos em Salvar não podem gerar dois POSTs
  // (um `x/y` duplicado criaria outra série de parcelas).
  const busy = useRef(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || busy.current) return;
    busy.current = true;
    Promise.resolve(onSubmit(draft)).finally(() => {
      busy.current = false;
    });
  }

  return (
    <Modal title={mode === 'create' ? 'Novo lançamento' : 'Editar lançamento'} onClose={onCancel} variant="sheet">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            Nome
            <input
              className={field}
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              autoComplete="off"
              maxLength={MAX_NAME_LENGTH}
            />
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
              onBlur={() => set('amount', maskAmount(draft.amount))}
            />
          </label>
          <div className="flex flex-col">
            <label className={labelCls}>
              Vencimento
              <input
                type="date"
                className={field}
                value={draft.dueDate}
                onChange={(e) => (mode === 'create' ? setDraft((d) => withDueDate(d, e.target.value)) : set('dueDate', e.target.value))}
              />
            </label>
            {mode === 'create' && (
              <ChargeMonthToggle
                value={draft.nextMonth}
                disabled={!canWrite}
                onChange={(next) => setDraft((d) => setChargeNextMonth(d, next))}
              />
            )}
          </div>
        </div>
        <label className={labelCls}>
          Método
          <select
            className={field}
            value={draft.methodId}
            onChange={(e) =>
              setDraft((d) => (mode === 'create' ? withCreateMethod(d, e.target.value, byId) : withMethod(d, e.target.value, byId)))
            }
          >
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
            <input
              className={field}
              value={draft.pixKey}
              onChange={(e) => set('pixKey', e.target.value)}
              autoComplete="off"
              maxLength={MAX_PIX_KEY_LENGTH}
            />
          </label>
        )}
        {mode === 'create' && !hint && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.monthly} onChange={(e) => set('monthly', e.target.checked)} />
            Mensal
          </label>
        )}
        {mode === 'edit' && tags.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted">
            Etiquetas
            <TagPicker
              label="Etiquetas"
              tags={tags}
              value={draft.tagIds}
              disabled={!canWrite}
              onChange={(next) => set('tagIds', next)}
            />
          </div>
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
