import { formatEntryName, type EntryDTO, type IsoDate } from '@pluton/shared';
import type { Entry, Series } from '../generated/prisma/client';

/**
 * Conversão `@db.Date` ↔ `IsoDate`. Única porta de entrada/saída de datas puras:
 * sempre meia-noite UTC, nunca APIs de horário local (o fuso do processo é irrelevante).
 */
export function fromIsoDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` que existe no calendário (rejeita 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = fromIsoDate(value);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

export type EntryWithSeries = Entry & {
  series: Pick<Series, 'type' | 'totalInstallments'> | null;
};

export function toEntryDTO(entry: EntryWithSeries): EntryDTO {
  const totalInstallments = entry.series?.totalInstallments ?? null;
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    displayName: formatEntryName(entry.name, entry.sequence, totalInstallments),
    amountCents: entry.amountCents,
    dueDate: toIsoDate(entry.dueDate),
    paymentMethodId: entry.paymentMethodId,
    pixKey: entry.pixKey,
    note: entry.note,
    paidOn: entry.paidOn ? toIsoDate(entry.paidOn) : null,
    seriesId: entry.seriesId,
    seriesType: entry.series?.type ?? null,
    sequence: entry.sequence,
    totalInstallments,
  };
}

/** `include` padrão para montar `EntryDTO`. */
export const entryInclude = {
  series: { select: { type: true, totalInstallments: true } },
} as const;

/** Ordem de exibição: `dueDate`, depois `displayName` (pt-BR), depois `id` (estável). */
export function sortEntryDTOs(entries: EntryDTO[]): EntryDTO[] {
  return [...entries].sort(
    (a, b) =>
      // IsoDate: comparação de string é cronológica.
      (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) ||
      a.displayName.localeCompare(b.displayName, 'pt-BR', { numeric: true }) ||
      a.id.localeCompare(b.id),
  );
}
