import { addMonthsToKey, formatDatePtBR, monthKeyOf, todayInSaoPaulo, type MonthKey } from '@pluton/shared';

export const PENDING_ALL = 'pendentes';
export type MonthSelection = MonthKey | typeof PENDING_ALL;

/** "2026-12" → "dezembro de 2026". */
export function monthLabel(key: MonthKey): string {
  return formatDatePtBR(`${key}-01`).replace(/^\d+ de /, '');
}

const shortcut =
  'rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:bg-hover hover:text-ink aria-pressed:bg-hover aria-pressed:text-ink';
const arrow = 'rounded-md px-2 py-1 text-muted hover:bg-hover hover:text-ink';

interface Props {
  value: MonthSelection;
  /** Mês exibido quando `value` é "todos os pendentes" (base das setas). */
  baseMonth: MonthKey;
  onChange: (next: MonthSelection) => void;
}

export function MonthPicker({ value, baseMonth, onChange }: Props) {
  const all = value === PENDING_ALL;
  const month = all ? baseMonth : value;
  const current = monthKeyOf(todayInSaoPaulo());
  const next = addMonthsToKey(current, 1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className={arrow} aria-label="Mês anterior" onClick={() => onChange(addMonthsToKey(month, -1))}>
          ‹
        </button>
        <span className="min-w-36 text-center text-sm font-medium capitalize text-ink">
          {all ? 'Todos os pendentes' : monthLabel(month)}
        </span>
        <button type="button" className={arrow} aria-label="Mês seguinte" onClick={() => onChange(addMonthsToKey(month, 1))}>
          ›
        </button>
      </div>
      <button type="button" className={shortcut} aria-pressed={!all && value === current} onClick={() => onChange(current)}>
        Este mês
      </button>
      <button type="button" className={shortcut} aria-pressed={!all && value === next} onClick={() => onChange(next)}>
        Próximo mês
      </button>
      <button type="button" className={shortcut} aria-pressed={all} onClick={() => onChange(PENDING_ALL)}>
        Todos os pendentes
      </button>
    </div>
  );
}
