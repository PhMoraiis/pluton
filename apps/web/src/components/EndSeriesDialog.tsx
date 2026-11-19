import { monthKeyOf, type EntryDTO, type MonthKey } from '@pluton/shared';
import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function isValidMonth(value: string): boolean {
  const m = MONTH_RE.exec(value);
  return m !== null && Number(m[1]) >= 2000 && Number(m[1]) <= 2100;
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
            className="rounded-md border border-line bg-bg px-2.5 py-2 text-sm text-ink"
          />
        </label>
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
