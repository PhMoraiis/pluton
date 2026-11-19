import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { formatBRL, formatDatePtBR, type EntryDTO, type PaymentMethodDTO } from '@pluton/shared';
import { useMemo } from 'react';
import { KindIcon } from './KindIcon';
import { MethodTag } from './MethodTag';

const col = createColumnHelper<EntryDTO>();

interface Props {
  rows: EntryDTO[];
  methods: Map<string, PaymentMethodDTO>;
  overdue?: boolean;
  caption: string;
}

export function EntriesTable({ rows, methods, overdue = false, caption }: Props) {
  const columns = useMemo(
    () => [
      col.accessor('dueDate', { header: 'Data', cell: (c) => formatDatePtBR(c.getValue()) }),
      col.accessor('displayName', {
        header: 'Nome',
        cell: (c) => (
          <span className="flex items-center gap-2">
            <KindIcon kind={c.row.original.kind} />
            <span>{c.getValue()}</span>
          </span>
        ),
      }),
      col.accessor('amountCents', {
        header: () => <span className="block text-right">Valor</span>,
        cell: (c) => <span className="block text-right tabular-nums">{formatBRL(c.getValue())}</span>,
      }),
      col.accessor('paymentMethodId', {
        header: 'Método',
        cell: (c) => {
          const id = c.getValue();
          return <MethodTag method={id ? methods.get(id) : undefined} />;
        },
      }),
      col.accessor('paidOn', {
        header: 'Pago',
        cell: (c) => (
          <input
            type="checkbox"
            checked={c.getValue() != null}
            disabled
            readOnly
            aria-label={`Pago: ${c.row.original.displayName}`}
          />
        ),
      }),
    ],
    [methods],
  );

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id });

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id} className="border-b border-line text-left text-xs font-normal text-muted">
            {hg.headers.map((h) => (
              <th key={h.id} className="px-2 py-1.5 font-normal">
                {flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((r) => (
          <tr key={r.id} className={`border-b border-line ${overdue ? 'bg-danger/10' : 'hover:bg-hover'}`}>
            {r.getVisibleCells().map((c) => (
              <td key={c.id} className="px-2 py-1.5 text-ink">
                {flexRender(c.column.columnDef.cell, c.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
