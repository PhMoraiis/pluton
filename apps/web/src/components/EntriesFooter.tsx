import { formatBRL, type EntryDTO } from '@pluton/shared';

/** `CONTAGEM n   SOMA R$ x` das linhas exibidas na lista principal (sem atrasados). */
export function EntriesFooter({ rows }: { rows: EntryDTO[] }) {
  const sum = rows.reduce((acc, r) => acc + r.amountCents, 0);
  return (
    <div data-testid="entries-footer" className="flex gap-6 px-2 py-2 text-xs text-muted">
      <span>CONTAGEM {rows.length}</span>
      <span>SOMA {formatBRL(sum)}</span>
    </div>
  );
}
