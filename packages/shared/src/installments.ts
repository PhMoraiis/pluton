import { addMonthsClamped, dayOf } from './dates';
import type { IsoDate } from './types';

const INSTALLMENT_RE = /^(.*\S)\s+(\d+)\s*\/\s*(\d+)$/;
const MAX_INSTALLMENTS = 360;

export function parseInstallmentName(
  name: string,
): { baseName: string; current: number; total: number } | null {
  const match = INSTALLMENT_RE.exec(name.trim());
  if (!match) return null;
  const baseName = (match[1] ?? '').trim();
  const current = Number(match[2]);
  const total = Number(match[3]);
  if (!baseName) return null;
  if (current < 1 || current > total || total > MAX_INSTALLMENTS) return null;
  return { baseName, current, total };
}

export function formatEntryName(
  baseName: string,
  sequence: number | null,
  total: number | null,
): string {
  if (total === null || sequence === null) return baseName;
  return `${baseName} ${sequence}/${total}`;
}

export function planSequence(
  start: IsoDate,
  fromSeq: number,
  toSeq: number,
  dayOfMonth: number,
): Array<{ sequence: number; dueDate: IsoDate }> {
  const plan: Array<{ sequence: number; dueDate: IsoDate }> = [];
  for (let seq = fromSeq; seq <= toSeq; seq++) {
    plan.push({ sequence: seq, dueDate: addMonthsClamped(start, seq - fromSeq, dayOfMonth) });
  }
  return plan;
}

export interface SeriesEntryLike {
  id: string;
  sequence: number;
  dueDate: IsoDate;
  amountCents: number;
  paidOn: IsoDate | null;
}

export function propagateFollowing(
  entries: SeriesEntryLike[],
  editedSequence: number,
  change: { dueDate?: IsoDate; amountCents?: number },
): Array<{ id: string; dueDate?: IsoDate; amountCents?: number }> {
  if (!entries.some((e) => e.sequence === editedSequence)) {
    throw new Error(`Edited sequence ${editedSequence} not found in series`);
  }
  return [...entries]
    .filter(
      (e) => e.sequence === editedSequence || (e.sequence > editedSequence && e.paidOn === null),
    )
    .sort((a, b) => a.sequence - b.sequence)
    .map((e) => {
      const out: { id: string; dueDate?: IsoDate; amountCents?: number } = { id: e.id };
      if (change.dueDate !== undefined) {
        out.dueDate = addMonthsClamped(
          change.dueDate,
          e.sequence - editedSequence,
          dayOf(change.dueDate),
        );
      }
      if (change.amountCents !== undefined) out.amountCents = change.amountCents;
      return out;
    });
}
