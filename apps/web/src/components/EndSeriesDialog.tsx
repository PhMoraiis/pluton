import { monthKeyOf, type EntryDTO, type MonthKey } from '@pluton/shared';
import { useState, type FormEvent } from 'react';
import { isMonthKey, MONTH_PATTERN, MONTH_PLACEHOLDER, MONTH_TITLE } from '../lib/monthInput';
import { Modal } from './Modal';

/** `AAAA-MM` com ano 2000..2100 (mesma faixa da API). */
function isValidMonth(value: string): boolean {
  if (!isMonthKey(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

interface Props {
  entry: EntryDTO;
  canWrite: boolean;
  onConfirm: (lastMonth: MonthKey) => void;
  onCancel: () => void;
}

/** `Encerrar série` mensal: escolhe o último mês com lançamento (padrão: o mês da linha). */
export function EndSeriesDialog({ entry, canWrite, onConfirm, onCancel }: Props) {
  const [month, setMonth] = useState<string>(monthKeyOf(entry.dueDate));
  const valid = isValidMonth(month);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid && canWrite) onConfirm(month);
  }

  return (
    <Modal title="Encerrar série" onClose={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          “{entry.displayName}” não se repete depois do mês escolhido. Lançamentos já pagos são preservados.
        </p>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Último mês
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder={MONTH_PLACEHOLDER}
            pattern={MONTH_PATTERN}
            title={MONTH_TITLE}
            aria-invalid={!valid}
            className="rounded-md border border-line bg-bg px-2.5 py-2 text-sm text-ink"
          />
        </label>
        {!valid && (
          <p role="alert" className="text-sm text-danger">
            Mês inválido. Use o formato AAAA-MM (ex.: 2027-02).
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!valid || !canWrite}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Encerrar série
          </button>
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-hover">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
