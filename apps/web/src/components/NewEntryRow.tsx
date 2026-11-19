import type { EntryKind, IsoDate, PaymentMethodDTO } from '@pluton/shared';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  draftToCreate,
  emptyDraft,
  installmentHint,
  isPix,
  maskAmount,
  MAX_NAME_LENGTH,
  MAX_PIX_KEY_LENGTH,
  sortedMethods,
  withMethod,
  type EntryDraft,
} from '../lib/entryDraft';
import { useCreateEntry } from '../lib/entryMutations';
import { friendlyError } from '../lib/errors';
import { EntrySheet } from './EntrySheet';

interface Props {
  kind: EntryKind;
  /** Data padrão: dia 5 do mês exibido. */
  defaultDate: IsoDate;
  methods: PaymentMethodDTO[];
  canWrite: boolean;
  /** `table`: linha no fim da tabela; `floating`: botão flutuante + formulário (celular). */
  variant: 'table' | 'floating';
  /** Número de colunas da tabela (variante `table`). */
  columns?: number;
}

const addButton =
  'rounded-md px-2 py-1 text-sm text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50';
const cellInput = 'w-full rounded border border-line bg-bg px-1.5 py-1 text-sm text-ink placeholder:text-muted focus:border-accent outline-none';

/** `+ Nova linha`: criação rápida pelo teclado (Enter salva, Esc cancela). */
export function NewEntryRow({ kind, defaultDate, methods, canWrite, variant, columns = 6 }: Props) {
  const list = useMemo(() => sortedMethods(methods), [methods]);
  const byId = useMemo(() => new Map(list.map((m) => [m.id, m])), [list]);
  const defaultMethod = list[0]?.id ?? '';
  const create = useCreateEntry();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(() => emptyDraft(defaultDate, ''));
  const [error, setError] = useState<string | null>(null);
  /** O usuário escolheu um método (inclusive "Sem método"); antes disso vale o padrão. */
  const [methodChosen, setMethodChosen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Métodos podem chegar depois de abrir a linha: vazio = primeiro método (Pix).
  const current: EntryDraft = methodChosen ? draft : { ...draft, methodId: draft.methodId || defaultMethod };
  const hint = installmentHint(current.name);
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function openRow() {
    setDraft(emptyDraft(defaultDate, defaultMethod));
    setMethodChosen(false);
    setError(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  // Trava síncrona (o `isPending` só muda no próximo render): dois Enter seguidos
  // não podem gerar dois POSTs — um `x/y` duplicado criaria outra série de parcelas.
  const inFlight = useRef(false);

  function save(source: EntryDraft, onSaved: () => void): Promise<void> | undefined {
    if (!canWrite || inFlight.current) return;
    const result = draftToCreate(kind, source, byId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    inFlight.current = true;
    return create
      .mutateAsync(result.value)
      .then(onSaved, (e: unknown) => setError(friendlyError(e)))
      .finally(() => {
        inFlight.current = false;
      });
  }

  if (variant === 'floating') {
    return (
      <>
        <button
          type="button"
          disabled={!canWrite}
          onClick={openRow}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-lg disabled:opacity-50"
        >
          + Nova linha
        </button>
        {open && (
          <EntrySheet
            mode="create"
            initial={current}
            methods={list}
            canWrite={canWrite}
            saving={create.isPending}
            error={error}
            onSubmit={(d) => save(d, close)}
            onCancel={close}
          />
        )}
      </>
    );
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={columns} className="px-2 py-1.5">
          <button type="button" disabled={!canWrite} onClick={openRow} className={addButton}>
            + Nova linha
          </button>
        </td>
      </tr>
    );
  }

  function submitRow() {
    save(current, () => {
      // Nova linha vazia, pronta para o próximo lançamento.
      setDraft(emptyDraft(defaultDate, defaultMethod));
      setMethodChosen(false);
      nameRef.current?.focus();
    });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      // Enter num botão (Salvar/Cancelar) segue o comportamento do próprio botão.
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      submitRow();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  const disabled = !canWrite;
  return (
    <>
      <tr className="border-b border-line bg-hover align-top" onKeyDown={onKey}>
        <td className="px-2 py-1.5">
          <input
            type="date"
            aria-label="Vencimento"
            className={cellInput}
            disabled={disabled}
            value={current.dueDate}
            onChange={(e) => set('dueDate', e.target.value)}
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            ref={nameRef}
            autoFocus
            aria-label="Nome"
            placeholder="Nome (ex.: Fone 1/7)"
            autoComplete="off"
            maxLength={MAX_NAME_LENGTH}
            className={cellInput}
            disabled={disabled}
            value={current.name}
            onChange={(e) => set('name', e.target.value)}
          />
          {hint && <p className="mt-1 text-xs text-accent">{hint}</p>}
        </td>
        <td className="px-2 py-1.5">
          <input
            aria-label="Valor"
            inputMode="decimal"
            placeholder="0,00"
            className={`${cellInput} text-right`}
            disabled={disabled}
            value={current.amount}
            onChange={(e) => set('amount', e.target.value)}
            onBlur={() => set('amount', maskAmount(current.amount))}
          />
        </td>
        <td className="px-2 py-1.5">
          <select
            aria-label="Método"
            className={cellInput}
            disabled={disabled}
            value={current.methodId}
            onChange={(e) => {
              setMethodChosen(true);
              setDraft((d) => withMethod(d, e.target.value, byId));
            }}
          >
            <option value="">Sem método</option>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {isPix(byId, current.methodId) && (
            <input
              aria-label="Chave Pix"
              placeholder="Chave Pix (opcional)"
              autoComplete="off"
              maxLength={MAX_PIX_KEY_LENGTH}
              className={`${cellInput} mt-1`}
              disabled={disabled}
              value={current.pixKey}
              onChange={(e) => set('pixKey', e.target.value)}
            />
          )}
        </td>
        <td className="px-2 py-1.5">
          {!hint && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                disabled={disabled}
                checked={current.monthly}
                onChange={(e) => set('monthly', e.target.checked)}
              />
              Mensal
            </label>
          )}
        </td>
        <td className="px-2 py-1.5 text-right">
          <span className="flex justify-end gap-1">
            <button
              type="button"
              disabled={disabled || create.isPending}
              onClick={submitRow}
              className="rounded px-1.5 py-0.5 text-xs text-accent hover:bg-bg disabled:opacity-50"
            >
              Salvar
            </button>
            <button type="button" onClick={close} className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-bg">
              Cancelar
            </button>
          </span>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={columns} role="alert" className="px-2 pb-1.5 text-xs text-danger">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
