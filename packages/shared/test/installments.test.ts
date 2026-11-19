import { describe, expect, it } from 'vitest';
import {
  formatEntryName,
  parseInstallmentName,
  planSequence,
  propagateFollowing,
} from '../src/installments';

describe('parseInstallmentName', () => {
  it('parses trailing x/y', () => {
    expect(parseInstallmentName('Fone 1/7')).toEqual({ baseName: 'Fone', current: 1, total: 7 });
    expect(parseInstallmentName('Capa, Case Switch 2/3')).toEqual({ baseName: 'Capa, Case Switch', current: 2, total: 3 });
    expect(parseInstallmentName('GTA 6 3 / 9')).toEqual({ baseName: 'GTA 6', current: 3, total: 9 });
  });
  it('rejects invalid names', () => {
    expect(parseInstallmentName('Spotify')).toBeNull();
    expect(parseInstallmentName('Fone 8/7')).toBeNull();
    expect(parseInstallmentName('Fone 0/7')).toBeNull();
    expect(parseInstallmentName('3/7')).toBeNull();
    expect(parseInstallmentName('Fone 1/361')).toBeNull();
  });
  it('accepts upper bound 360', () => {
    expect(parseInstallmentName('Casa 360/360')).toEqual({ baseName: 'Casa', current: 360, total: 360 });
  });
});

describe('formatEntryName', () => {
  it('formats with and without total', () => {
    expect(formatEntryName('Fone', 3, 7)).toBe('Fone 3/7');
    expect(formatEntryName('Spotify', 4, null)).toBe('Spotify');
    expect(formatEntryName('Spotify', null, null)).toBe('Spotify');
  });
});

describe('planSequence', () => {
  it('plans monthly dates', () => {
    expect(planSequence('2026-12-05', 3, 5, 5)).toEqual([
      { sequence: 3, dueDate: '2026-12-05' },
      { sequence: 4, dueDate: '2027-01-05' },
      { sequence: 5, dueDate: '2027-02-05' },
    ]);
  });
  it('clamps to month end but keeps day of month', () => {
    expect(planSequence('2026-01-31', 1, 3, 31).map((p) => p.dueDate)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('propagateFollowing', () => {
  const s = [
    { id: 'a', sequence: 3, dueDate: '2026-11-05', amountCents: 4290, paidOn: '2026-11-04' },
    { id: 'b', sequence: 4, dueDate: '2026-12-05', amountCents: 4290, paidOn: null },
    { id: 'c', sequence: 5, dueDate: '2027-01-05', amountCents: 4290, paidOn: '2026-11-10' },
    { id: 'd', sequence: 6, dueDate: '2027-02-05', amountCents: 4290, paidOn: null },
  ];
  it('propagates date to unpaid following', () => {
    expect(propagateFollowing(s, 4, { dueDate: '2026-12-10' })).toEqual([
      { id: 'b', dueDate: '2026-12-10' }, { id: 'd', dueDate: '2027-02-10' }]);
  });
  it('propagates amount', () => {
    expect(propagateFollowing(s, 4, { amountCents: 5000 })).toEqual([
      { id: 'b', amountCents: 5000 }, { id: 'd', amountCents: 5000 }]);
  });
  it('includes edited entry even if paid', () => {
    expect(propagateFollowing(s, 3, { dueDate: '2026-11-30' })[0]).toEqual({ id: 'a', dueDate: '2026-11-30' });
  });
  it('ignores input order and does not mutate', () => {
    const shuffled = [s[3]!, s[0]!, s[2]!, s[1]!];
    const copy = JSON.parse(JSON.stringify(shuffled));
    expect(propagateFollowing(shuffled, 4, { amountCents: 1 }).map((r) => r.id)).toEqual(['b', 'd']);
    expect(shuffled).toEqual(copy);
  });
  it('clamps day for following months', () => {
    const t = [
      { id: 'x', sequence: 1, dueDate: '2026-01-31', amountCents: 1, paidOn: null },
      { id: 'y', sequence: 2, dueDate: '2026-02-28', amountCents: 1, paidOn: null },
      { id: 'z', sequence: 3, dueDate: '2026-03-31', amountCents: 1, paidOn: null },
    ];
    expect(propagateFollowing(t, 1, { dueDate: '2026-01-31' })).toEqual([
      { id: 'x', dueDate: '2026-01-31' }, { id: 'y', dueDate: '2026-02-28' }, { id: 'z', dueDate: '2026-03-31' }]);
  });
  it('throws if edited sequence missing', () => {
    expect(() => propagateFollowing(s, 99, { amountCents: 1 })).toThrow();
  });
});
