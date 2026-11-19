import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildImportPlan,
  entryDedupeKey,
  formatEntryName,
  parseNotionCsv,
  parseNotionDate,
} from '../src';

const csv = readFileSync(new URL('./fixtures/notion-sample.csv', import.meta.url), 'utf8');
const TODAY = '2026-11-18';

describe('parseNotionDate', () => {
  it('parses long pt-BR dates', () => {
    expect(parseNotionDate('5 de dezembro de 2026')).toBe('2026-12-05');
    expect(parseNotionDate('31 de março de 2025')).toBe('2025-03-31');
    expect(parseNotionDate('1 de janeiro de 2024')).toBe('2024-01-01');
  });
  it('returns null for empty, unknown month or impossible day', () => {
    expect(parseNotionDate('')).toBeNull();
    expect(parseNotionDate('5 de foo de 2026')).toBeNull();
    expect(parseNotionDate('31 de fevereiro de 2026')).toBeNull();
  });
});

describe('parseNotionCsv', () => {
  const rows = parseNotionCsv(csv);
  it('reads every row, removing the BOM', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows).toHaveLength(17);
    expect(rows[0]?.name).toBe('Fone 1/7');
  });
  it('maps fields', () => {
    expect(rows[0]).toMatchObject({
      rowId: 1,
      amountCents: 25470,
      dueDate: '2026-09-05',
      paid: true,
      paymentMethod: 'Cartão',
      errors: [],
    });
    expect(rows[2]?.paid).toBe(false);
    expect(rows[11]?.paymentMethod).toBeNull();
    expect(rows[3]?.name).toBe('spotify');
    expect(rows[13]).toMatchObject({ name: 'Mercado, feira', amountCents: 123456 });
  });
  it('flags errors', () => {
    expect(rows[14]?.errors).toEqual(['sem data']);
    expect(rows[15]?.errors).toEqual(['sem nome']);
    expect(rows[16]?.errors).toEqual(['sem valor']);
  });
});

describe('entryDedupeKey', () => {
  it('normalizes the name', () => {
    expect(entryDedupeKey('EXPENSE', ' Tenis ', '2026-10-20', 39900)).toBe(
      'EXPENSE|tenis|2026-10-20|39900',
    );
  });
});

describe('buildImportPlan', () => {
  const rows = parseNotionCsv(csv);
  const plan = () => buildImportPlan(rows, { today: TODAY, existingKeys: new Set() });

  it('builds installment series and completes the remaining ones', () => {
    const s = plan().installmentSeries.find((x) => x.baseName === 'Fone' && x.total === 7);
    expect(s).toBeDefined();
    expect(s!.entries).toHaveLength(7);
    expect(s!.dayOfMonth).toBe(5);
    expect(s!.amountCents).toBe(25470);
    expect(s!.paymentMethod).toBe('Cartão');
    const gen = s!.entries.filter((e) => e.generated);
    expect(gen.map((e) => [e.sequence, e.dueDate])).toEqual([
      [4, '2026-12-05'],
      [5, '2027-01-05'],
      [6, '2027-02-05'],
      [7, '2027-03-05'],
    ]);
    expect(gen.every((e) => !e.paid && e.amountCents === 25470 && e.rowId === null)).toBe(true);
    expect(s!.entries[0]).toMatchObject({ name: 'Fone', sequence: 1, generated: false, rowId: 1 });
  });

  it('splits repeated purchases into distinct series', () => {
    const series = plan().installmentSeries.filter((x) => x.total === 2);
    expect(series).toHaveLength(2);
    expect(series[0]!.key).not.toBe(series[1]!.key);
    expect(series.map((x) => x.entries.length)).toEqual([2, 2]);
    expect(series[0]!.entries[0]!.dueDate).toBe('2025-04-08');
    expect(series[1]!.entries[0]!.dueDate).toBe('2026-04-08');
  });

  it('suggests monthly entries', () => {
    const { monthlySuggestions: m } = plan();
    const spotify = m.find((x) => x.name === 'Spotify');
    expect(spotify).toMatchObject({ active: true, dayOfMonth: 10, amountCents: 2190 });
    expect(spotify!.entries).toHaveLength(4);
    const claro = m.find((x) => x.name === 'Claro Flex');
    expect(claro?.active).toBe(false);
    expect(m).toHaveLength(2);
  });

  it('keeps one-off rows as singles and invalid rows apart', () => {
    const p = plan();
    expect(p.singles.map((e) => e.name).sort()).toEqual(['Mercado, feira', 'Tenis']);
    expect(p.invalid.map((r) => r.errors)).toEqual([['sem data'], ['sem nome'], ['sem valor']]);
    expect(p.duplicates).toBe(0);
  });

  it('discards rows already imported', () => {
    const keys = new Set([entryDedupeKey('EXPENSE', 'Tenis', '2026-10-20', 39900)]);
    const p = buildImportPlan(rows, { today: TODAY, existingKeys: keys });
    expect(p.duplicates).toBe(1);
    expect(p.singles.map((e) => e.name)).not.toContain('Tenis');
  });

  it('dedupes installment rows by display name', () => {
    const keys = new Set([
      entryDedupeKey('EXPENSE', formatEntryName('Fone', 1, 7), '2026-09-05', 25470),
    ]);
    const p = buildImportPlan(rows, { today: TODAY, existingKeys: keys });
    expect(p.duplicates).toBe(1);
    const s = p.installmentSeries.find((x) => x.total === 7)!;
    expect(s.entries.filter((e) => !e.generated)).toHaveLength(2);
  });

  it('does not regenerate parcels that already exist', () => {
    const keys = new Set([
      entryDedupeKey('EXPENSE', 'Fone 3/7', '2026-11-05', 99999),
      entryDedupeKey('EXPENSE', 'Fone 4/7', '2026-12-05', 25470),
      entryDedupeKey('EXPENSE', 'Fone 5/7', '2027-01-06', 11111),
      entryDedupeKey('EXPENSE', 'Fone 6/7', '2027-02-05', 25470),
      entryDedupeKey('EXPENSE', 'Fone 7/7', '2027-03-05', 25470),
    ]);
    const p = buildImportPlan(rows, { today: TODAY, existingKeys: keys });
    const s = p.installmentSeries.find((x) => x.total === 7)!;
    expect(s.entries.filter((e) => e.generated)).toHaveLength(0);
    expect(s.entries).toHaveLength(3);
    expect(p.duplicates).toBe(4);
  });

  it('is deterministic', () => {
    expect(plan()).toEqual(plan());
  });

  it('overrides and exclusions', () => {
    const noDate = rows.find((r) => r.errors.includes('sem data'))!;
    const p = buildImportPlan(rows, {
      today: TODAY,
      existingKeys: new Set(),
      overrides: { [noDate.rowId]: { dueDate: '2025-06-05' } },
      excludedRowIds: [rows.find((r) => r.errors.includes('sem nome'))!.rowId],
    });
    expect(p.invalid.map((r) => r.errors)).toEqual([['sem valor']]);
    expect(p.singles.map((e) => e.name)).toContain('Presente');
  });
});
