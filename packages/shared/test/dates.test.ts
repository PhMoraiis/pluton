import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  addMonthsToKey,
  dayOf,
  defaultMonth,
  formatDatePtBR,
  monthKeyOf,
  monthRange,
  todayInSaoPaulo,
} from '../src/dates';

describe('addMonthsClamped', () => {
  it('clamps to end of month', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });
  it('restores series day', () => {
    expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
  it('crosses years both directions', () => {
    expect(addMonthsClamped('2026-12-05', 1)).toBe('2027-01-05');
    expect(addMonthsClamped('2026-03-10', -3)).toBe('2025-12-10');
  });
});

describe('todayInSaoPaulo', () => {
  it('uses Sao Paulo timezone', () => {
    expect(todayInSaoPaulo(new Date('2026-12-01T01:30:00Z'))).toBe('2026-11-30');
    expect(todayInSaoPaulo(new Date('2026-12-01T03:30:00Z'))).toBe('2026-12-01');
  });
});

describe('month helpers', () => {
  it('monthKeyOf and dayOf', () => {
    expect(monthKeyOf('2026-12-05')).toBe('2026-12');
    expect(dayOf('2026-12-05')).toBe(5);
  });
  it('monthRange', () => {
    expect(monthRange('2026-01', '2026-02')).toEqual({ start: '2026-01-01', end: '2026-02-28' });
    expect(monthRange('2028-02', '2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
  it('addMonthsToKey', () => {
    expect(addMonthsToKey('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12');
    expect(addMonthsToKey('2026-05', 0)).toBe('2026-05');
  });
});

describe('defaultMonth', () => {
  it('picks month of next pending due date >= today', () => {
    expect(defaultMonth(['2026-11-25', '2026-12-05'], '2026-11-18')).toBe('2026-11');
    expect(defaultMonth(['2026-12-05', '2026-11-05'], '2026-11-18')).toBe('2026-12');
    expect(defaultMonth(['2026-11-18'], '2026-11-18')).toBe('2026-11');
  });
  it('falls back to today month', () => {
    expect(defaultMonth([], '2026-11-18')).toBe('2026-11');
    expect(defaultMonth(['2026-10-01'], '2026-11-18')).toBe('2026-11');
  });
});

describe('formatDatePtBR', () => {
  it('formats without leading zero', () => {
    expect(formatDatePtBR('2026-12-05')).toBe('5 de dezembro de 2026');
    expect(formatDatePtBR('2026-03-31')).toBe('31 de março de 2026');
  });
});
