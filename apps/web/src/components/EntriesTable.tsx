import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { formatBRL, formatDatePtBR, type EntryDTO } from '@pluton/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  centsToInput,
  isValidDueDate,
  MAX_NAME_LENGTH,
  methodPatch,
  knownTagIds,
  parseAmount,
  sameTagSet,
  sortedMethods,
} from '../lib/entryDraft';
import type { SortKey, SortState } from '../lib/sortEntries';
import { EditableCell } from './EditableCell';
import { useEntryActions } from './EntryActions';
import { KindIcon } from './KindIcon';
import { MethodTag } from './MethodTag';
import { TagChips } from './TagChips';
import { TagPicker } from './TagPicker';
import { RowActions } from './RowActions';

/*
 * As células são componentes estáveis (definidos no módulo) que leem as ações do
 * contexto. Funções de célula recriadas a cada render fariam o `flexRender`
 * remontar a célula — e a edição inline em andamento se perderia.
 */

function DateCell({ entry }: { entry: EntryDTO }) {
  const { canWrite, edit, showError } = useEntryActions();
  return (
    <EditableCell
      field="Data"
      type="date"
      entryName={entry.displayName}
      display={formatDatePtBR(entry.dueDate)}
      initial={entry.dueDate}
      disabled={!canWrite}
      onCommit={(v) => (isValidDueDate(v) ? edit(entry, { dueDate: v }) : showError('Data inválida.'))}
    />
  );
}

function NameCell({ entry }: { entry: EntryDTO }) {
  const { canWrite, edit } = useEntryActions();
  return (
    <EditableCell
      field="Nome"
      entryName={entry.displayName}
      display={
        <span className="flex items-center gap-2">
          <KindIcon kind={entry.kind} />
          <span>{entry.displayName}</span>
        </span>
      }
      initial={entry.displayName}
      maxLength={MAX_NAME_LENGTH}
      disabled={!canWrite}
      onCommit={(v) => {
        const name = v.trim();
        if (name && name !== entry.displayName) edit(entry, { name });
      }}
    />
  );
}

function AmountCell({ entry }: { entry: EntryDTO }) {
  const { canWrite, edit, showError } = useEntryActions();
  return (
    <EditableCell
      field="Valor"
      align="right"
      entryName={entry.displayName}
      display={<span className="tabular-nums">{formatBRL(entry.amountCents)}</span>}
      initial={centsToInput(entry.amountCents)}
      disabled={!canWrite}
      onCommit={(v) => {
        const cents = parseAmount(v);
        if (cents === null) showError('Valor inválido.');
        else if (cents !== entry.amountCents) edit(entry, { amountCents: cents });
      }}
    />
  );
}

function MethodCell({ entry }: { entry: EntryDTO }) {
  const { canWrite, edit, methods } = useEntryActions();
  const options = useMemo(
    () => [
      { value: '', label: 'Sem método' },
      ...sortedMethods([...methods.values()]).map((m) => ({ value: m.id, label: m.name })),
    ],
    [methods],
  );
  const id = entry.paymentMethodId;
  return (
    <EditableCell
      field="Método"
      type="select"
      options={options}
      entryName={entry.displayName}
      display={<MethodTag method={id ? methods.get(id) : undefined} />}
      initial={id ?? ''}
      disabled={!canWrite}
      onCommit={(v) => edit(entry, methodPatch(entry, v || null, methods))}
    />
  );
}

function TagsCell({ entry }: { entry: EntryDTO }) {
  const { canWrite, edit, tags } = useEntryActions();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(entry.tagIds);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // O fechamento (Esc, clique fora) roda em listeners de documento: lê o valor mais recente.
  const latest = useRef({ draft, entry, edit });
  latest.current = { draft, entry, edit };

  // Sem conexão com o painel aberto: fecha sem aplicar (e desarma os listeners).
  useEffect(() => {
    if (!canWrite) setOpen(false);
  }, [canWrite]);

  function close() {
    const { draft: d, entry: e, edit: save } = latest.current;
    const known = knownTagIds(e.tagIds, tags);
    setOpen(false);
    trigger.current?.focus();
    if (!sameTagSet(d, known)) save(e, { tagIds: d });
  }
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('input:not([disabled]), button')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    }
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) closeRef.current();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-block">
      <button
        ref={trigger}
        type="button"
        aria-label={`Etiquetas: ${entry.displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!canWrite}
        onClick={() => {
          setDraft(knownTagIds(entry.tagIds, tags));
          setOpen(true);
        }}
        className="rounded px-1 py-0.5 text-left hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
      >
        <TagChips tagIds={entry.tagIds} tags={tags} empty />
      </button>
      {open && canWrite && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Etiquetas de ${entry.displayName}`}
          className="absolute left-0 top-full z-20 mt-1 flex min-w-44 flex-col gap-2 rounded-md border border-line bg-surface p-2 shadow-xl"
        >
          <TagPicker label="Etiquetas" tags={[...tags.values()]} value={draft} onChange={setDraft} disabled={!canWrite} />
          <button type="button" onClick={close} className="self-end rounded-md bg-accent px-3 py-1 text-xs font-medium text-white">
            Aplicar
          </button>
        </div>
      )}
    </span>
  );
}

function PaidCell({ entry }: { entry: EntryDTO }) {
  const { canWrite, setPaid } = useEntryActions();
  return (
    <input
      type="checkbox"
      checked={entry.paidOn != null}
      disabled={!canWrite}
      onChange={(e) => setPaid(entry, e.target.checked)}
      aria-label={`Pago: ${entry.displayName}`}
    />
  );
}

const col = createColumnHelper<EntryDTO>();

const columns = [
  col.accessor('dueDate', { header: 'Data', meta: { sortKey: 'data' as SortKey }, cell: (c) => <DateCell entry={c.row.original} /> }),
  col.accessor('displayName', { header: 'Nome', meta: { sortKey: 'nome' as SortKey }, cell: (c) => <NameCell entry={c.row.original} /> }),
  col.accessor('amountCents', {
    header: 'Valor',
    meta: { sortKey: 'valor' as SortKey, align: 'right' as const },
    cell: (c) => <AmountCell entry={c.row.original} />,
  }),
  col.accessor('paymentMethodId', {
    header: 'Método',
    meta: { sortKey: 'metodo' as SortKey },
    cell: (c) => <MethodCell entry={c.row.original} />,
  }),
  col.display({ id: 'tags', header: 'Etiquetas', cell: (c) => <TagsCell entry={c.row.original} /> }),
  col.accessor('paidOn', { header: 'Pago', cell: (c) => <PaidCell entry={c.row.original} /> }),
  col.display({
    id: 'actions',
    header: () => <span className="sr-only">Ações</span>,
    cell: (c) => <RowActions entry={c.row.original} />,
  }),
];

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    sortKey?: SortKey;
    align?: 'right';
  }
}

export const TABLE_COLUMNS = columns.length;

interface Props {
  rows: EntryDTO[];
  overdue?: boolean;
  caption: string;
  /** Linha extra no fim (ex.: `+ Nova linha`). */
  footerRow?: ReactNode;
  emptyMessage?: string;
  /** Ordenação atual; sem `onSort` (ex.: atrasados) os cabeçalhos são texto simples. */
  sort?: SortState;
  onSort?: (key: SortKey) => void;
}

export function EntriesTable({ rows, overdue = false, caption, footerRow, emptyMessage, sort = null, onSort }: Props) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id });

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id} className="border-b border-line text-left text-xs font-normal text-muted">
            {hg.headers.map((h) => {
              const sortKey = h.column.columnDef.meta?.sortKey;
              const right = h.column.columnDef.meta?.align === 'right';
              const title = flexRender(h.column.columnDef.header, h.getContext());
              if (!onSort || !sortKey) {
                return (
                  <th key={h.id} className="px-2 py-1.5 font-normal">
                    {right ? <span className="block text-right">{title}</span> : title}
                  </th>
                );
              }
              const active = sort?.key === sortKey ? sort.dir : null;
              return (
                <th
                  key={h.id}
                  aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
                  className="px-2 py-1.5 font-normal"
                >
                  <button
                    type="button"
                    onClick={() => onSort(sortKey)}
                    className={`inline-flex w-full items-center gap-1 hover:text-ink ${right ? 'justify-end' : ''}`}
                  >
                    {title}
                    <span aria-hidden="true" className="w-2 text-[0.6rem]">
                      {active === 'asc' ? '▲' : active === 'desc' ? '▼' : ''}
                    </span>
                  </button>
                </th>
              );
            })}
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
        {rows.length === 0 && emptyMessage && (
          <tr>
            <td colSpan={TABLE_COLUMNS} className="px-2 py-4 text-sm text-muted">
              {emptyMessage}
            </td>
          </tr>
        )}
        {footerRow}
      </tbody>
    </table>
  );
}
