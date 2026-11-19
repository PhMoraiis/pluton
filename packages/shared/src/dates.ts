import type { IsoDate, MonthKey } from './types';

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
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

function pad(n: number, size = 2): string {
  return String(n).padStart(size, '0');
}

function parseIso(date: IsoDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid IsoDate: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function parseKey(key: MonthKey): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid MonthKey: ${key}`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

function daysInMonth(y: number, m: number): number {
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (m === 2) return isLeap ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function shiftMonth(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (((idx % 12) + 12) % 12) + 1 };
}

export function addMonthsClamped(date: IsoDate, months: number, dayOfMonth?: number): IsoDate {
  const { y, m, d } = parseIso(date);
  const t = shiftMonth(y, m, months);
  const day = Math.min(dayOfMonth ?? d, daysInMonth(t.y, t.m));
  return `${pad(t.y, 4)}-${pad(t.m)}-${pad(day)}`;
}

export function todayInSaoPaulo(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function monthKeyOf(date: IsoDate): MonthKey {
  const { y, m } = parseIso(date);
  return `${pad(y, 4)}-${pad(m)}`;
}

export function monthRange(from: MonthKey, to: MonthKey): { start: IsoDate; end: IsoDate } {
  const f = parseKey(from);
  const t = parseKey(to);
  return {
    start: `${pad(f.y, 4)}-${pad(f.m)}-01`,
    end: `${pad(t.y, 4)}-${pad(t.m)}-${pad(daysInMonth(t.y, t.m))}`,
  };
}

export function addMonthsToKey(key: MonthKey, n: number): MonthKey {
  const { y, m } = parseKey(key);
  const t = shiftMonth(y, m, n);
  return `${pad(t.y, 4)}-${pad(t.m)}`;
}

export function defaultMonth(pendingDueDates: IsoDate[], today: IsoDate): MonthKey {
  // IsoDate strings compare chronologically with plain string comparison.
  const upcoming = pendingDueDates.filter((d) => d >= today).sort();
  const first = upcoming[0];
  return monthKeyOf(first ?? today);
}

export function formatDatePtBR(date: IsoDate): string {
  const { y, m, d } = parseIso(date);
  return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
}

export function dayOf(date: IsoDate): number {
  return parseIso(date).d;
}
