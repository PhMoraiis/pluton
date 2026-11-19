import { formatBRL, formatDatePtBR, type EntryDTO, type PaymentMethodDTO } from '@pluton/shared';
import { KindIcon } from './KindIcon';
import { MethodTag } from './MethodTag';

interface Props {
  rows: EntryDTO[];
  methods: Map<string, PaymentMethodDTO>;
  overdue?: boolean;
}

export function EntryCards({ rows, methods, overdue = false }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((e) => (
        <li
          key={e.id}
          className={`rounded-lg border px-3 py-2.5 ${overdue ? 'border-danger/40 bg-danger/10' : 'border-line bg-surface'}`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5">
              <KindIcon kind={e.kind} />
            </span>
            <span className="min-w-0 flex-1 break-words text-sm text-ink">{e.displayName}</span>
            <span className="text-sm font-medium tabular-nums text-ink">{formatBRL(e.amountCents)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 pl-6 text-xs text-muted">
            <span>{formatDatePtBR(e.dueDate)}</span>
            <MethodTag method={e.paymentMethodId ? methods.get(e.paymentMethodId) : undefined} />
            <label className="ml-auto flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={e.paidOn != null}
                disabled
                readOnly
                aria-label={`Pago: ${e.displayName}`}
              />
              Pago
            </label>
          </div>
        </li>
      ))}
    </ul>
  );
}
