import Papa from 'papaparse';
import { addMonthsToKey, dayOf, monthKeyOf } from './dates';
import { formatEntryName, parseInstallmentName, planSequence } from './installments';
import { parseBRL } from './money';
import type { EntryKind, IsoDate } from './types';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

export function parseNotionDate(s: string): IsoDate | null {
  const m = /^(\d{1,2})\s+de\s+(\S+)\s+de\s+(\d{4})$/.exec(stripAccents(s.trim().toLowerCase()));
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2] ?? '') + 1;
  const year = Number(m[3]);
  if (month < 1 || day < 1) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type NotionRowError = 'sem nome' | 'sem valor' | 'sem data';

export interface NotionRow {
  rowId: number;
  name: string;
  amountCents: number | null;
  dueDate: IsoDate | null;
  paid: boolean;
  paymentMethod: string | null;
  note: string;
  errors: string[];
}

function computeErrors(r: Pick<NotionRow, 'name' | 'amountCents' | 'dueDate'>): string[] {
  const errors: NotionRowError[] = [];
  if (!r.name.trim()) errors.push('sem nome');
  if (r.amountCents === null) errors.push('sem valor');
  if (r.dueDate === null) errors.push('sem data');
  return errors;
}

export function parseNotionCsv(text: string): NotionRow[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
  });
  return parsed.data.map((raw, i) => {
    const name = (raw['Name'] ?? '').trim();
    const amountRaw = (raw['Amount'] ?? '').trim();
    const amountCents = amountRaw ? parseBRL(amountRaw) : null;
    const dueDate = parseNotionDate(raw['Date'] ?? '');
    const method = (raw['Payment Method'] ?? '').trim();
    const row: NotionRow = {
      rowId: i + 1,
      name,
      amountCents,
      dueDate,
      paid: (raw['Pago'] ?? '').trim().toLowerCase() === 'yes',
      paymentMethod: method || null,
      note: (raw['Notes'] ?? '').trim(),
      errors: [],
    };
    row.errors = computeErrors(row);
    return row;
  });
}

export function entryDedupeKey(
  kind: EntryKind,
  displayName: string,
  dueDate: IsoDate,
  amountCents: number,
): string {
  return `${kind}|${displayName.trim().toLowerCase()}|${dueDate}|${amountCents}`;
}

export interface PlannedEntry {
  rowId: number | null;
  name: string;
  sequence: number | null;
  amountCents: number;
  dueDate: IsoDate;
  paid: boolean;
  paymentMethod: string | null;
  note: string;
  generated: boolean;
}

export interface ImportPlan {
  installmentSeries: Array<{
    key: string;
    baseName: string;
    total: number;
    dayOfMonth: number;
    amountCents: number;
    paymentMethod: string | null;
    entries: PlannedEntry[];
  }>;
  monthlySuggestions: Array<{
    key: string;
    name: string;
    dayOfMonth: number;
    amountCents: number;
    paymentMethod: string | null;
    active: boolean;
    entries: PlannedEntry[];
  }>;
  singles: PlannedEntry[];
  invalid: NotionRow[];
  duplicates: number;
}

export interface BuildImportPlanOptions {
  today: IsoDate;
  existingKeys: Set<string>;
  overrides?: Record<number, Partial<Pick<NotionRow, 'name' | 'amountCents' | 'dueDate'>>>;
  excludedRowIds?: number[];
}

interface ValidRow extends NotionRow {
  amountCents: number;
  dueDate: IsoDate;
}

interface InstallmentRow {
  row: ValidRow;
  baseName: string;
  sequence: number;
  total: number;
}

function toEntry(row: ValidRow, name: string, sequence: number | null): PlannedEntry {
  return {
    rowId: row.rowId,
    name,
    sequence,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    paid: row.paid,
    paymentMethod: row.paymentMethod,
    note: row.note,
    generated: false,
  };
}

// Stable sort by date (ties keep input order, or are broken by the caller).
function byDate<T extends { dueDate: IsoDate }>(a: T, b: T): number {
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
}

export function buildImportPlan(rows: NotionRow[], opts: BuildImportPlanOptions): ImportPlan {
  const excluded = new Set(opts.excludedRowIds ?? []);
  const invalid: NotionRow[] = [];
  const valid: ValidRow[] = [];

  for (const original of rows) {
    if (excluded.has(original.rowId)) continue;
    const merged: NotionRow = { ...original, ...(opts.overrides?.[original.rowId] ?? {}) };
    merged.name = merged.name.trim();
    merged.errors = computeErrors(merged);
    if (merged.errors.length > 0 || merged.amountCents === null || merged.dueDate === null) {
      invalid.push(merged);
    } else {
      valid.push(merged as ValidRow);
    }
  }

  let duplicates = 0;
  const installmentRows: InstallmentRow[] = [];
  const plainRows: ValidRow[] = [];

  for (const row of valid) {
    const inst = parseInstallmentName(row.name);
    const displayName = inst
      ? formatEntryName(inst.baseName, inst.current, inst.total)
      : row.name;
    if (opts.existingKeys.has(entryDedupeKey('EXPENSE', displayName, row.dueDate, row.amountCents))) {
      duplicates++;
      continue;
    }
    if (inst) {
      installmentRows.push({
        row,
        baseName: inst.baseName,
        sequence: inst.current,
        total: inst.total,
      });
    } else {
      plainRows.push(row);
    }
  }

  // Installments: group by (normalized base name, total), then split repeated purchases.
  const groups = new Map<string, InstallmentRow[]>();
  for (const ir of installmentRows) {
    const gk = `${normalizeName(ir.baseName)}|${ir.total}`;
    const list = groups.get(gk);
    if (list) list.push(ir);
    else groups.set(gk, [ir]);
  }

  const installmentSeries: ImportPlan['installmentSeries'] = [];
  for (const [gk, list] of groups) {
    const sorted = [...list].sort(
      (a, b) => byDate(a.row, b.row) || a.sequence - b.sequence,
    );
    const chunks: InstallmentRow[][] = [];
    let current: InstallmentRow[] = [];
    let seen = new Set<number>();
    for (const ir of sorted) {
      if (seen.has(ir.sequence)) {
        chunks.push(current);
        current = [];
        seen = new Set();
      }
      current.push(ir);
      seen.add(ir.sequence);
    }
    if (current.length > 0) chunks.push(current);

    for (const chunk of chunks) {
      const last = chunk.reduce((a, b) => (b.sequence >= a.sequence ? b : a));
      const total = last.total;
      const baseName = last.baseName;
      const dayOfMonth = dayOf(last.row.dueDate);
      const entries: PlannedEntry[] = [...chunk]
        .sort((a, b) => a.sequence - b.sequence)
        .map((ir) => toEntry(ir.row, baseName, ir.sequence));
      for (const p of planSequence(last.row.dueDate, last.sequence, total, dayOfMonth).slice(1)) {
        entries.push({
          rowId: null,
          name: baseName,
          sequence: p.sequence,
          amountCents: last.row.amountCents,
          dueDate: p.dueDate,
          paid: false,
          paymentMethod: last.row.paymentMethod,
          note: '',
          generated: true,
        });
      }
      installmentSeries.push({
        key: `${gk}|${installmentSeries.length}`,
        baseName,
        total,
        dayOfMonth,
        amountCents: last.row.amountCents,
        paymentMethod: last.row.paymentMethod,
        entries,
      });
    }
  }

  // Non-installments: >= 3 distinct months with the same name => monthly suggestion.
  const plainGroups = new Map<string, ValidRow[]>();
  for (const row of plainRows) {
    const gk = normalizeName(row.name);
    const list = plainGroups.get(gk);
    if (list) list.push(row);
    else plainGroups.set(gk, [row]);
  }

  const monthlySuggestions: ImportPlan['monthlySuggestions'] = [];
  const singles: PlannedEntry[] = [];
  const activeFrom = addMonthsToKey(monthKeyOf(opts.today), -1);
  for (const [gk, list] of plainGroups) {
    const months = new Set(list.map((r) => monthKeyOf(r.dueDate)));
    if (months.size >= 3) {
      const sorted = [...list].sort(byDate);
      const last = sorted[sorted.length - 1] as ValidRow;
      monthlySuggestions.push({
        key: `${gk}|monthly|${monthlySuggestions.length}`,
        name: last.name,
        dayOfMonth: dayOf(last.dueDate),
        amountCents: last.amountCents,
        paymentMethod: last.paymentMethod,
        active: monthKeyOf(last.dueDate) >= activeFrom,
        entries: sorted.map((r) => toEntry(r, r.name, null)),
      });
    } else {
      for (const r of list) singles.push(toEntry(r, r.name, null));
    }
  }
  singles.sort((a, b) => byDate(a, b) || (a.rowId ?? 0) - (b.rowId ?? 0));

  return { installmentSeries, monthlySuggestions, singles, invalid, duplicates };
}
