import { describe, expect, test } from 'vitest';
import type { EntryDTO, PaymentMethodDTO } from '@pluton/shared';
import { draftFromEntry, emptyDraft, setChargeNextMonth, withCreateMethod, withDueDate } from '../lib/entryDraft';

const methods = new Map<string, PaymentMethodDTO>([
  ['m-pix', { id: 'm-pix', name: 'Pix', color: '#000000', sortOrder: 0, chargeNextMonth: false }],
  ['m-card', { id: 'm-card', name: 'Cartão de crédito', color: '#000000', sortOrder: 1, chargeNextMonth: true }],
  ['m-card2', { id: 'm-card2', name: 'Cartão Nubank', color: '#000000', sortOrder: 2, chargeNextMonth: true }],
]);

const base = (date = '2026-11-05') => emptyDraft(date, 'm-pix');

describe('setChargeNextMonth', () => {
  test('ligar avança um mês e desligar restaura', () => {
    const on = setChargeNextMonth(base(), true);
    expect(on).toMatchObject({ dueDate: '2026-12-05', shiftedFrom: '2026-11-05', nextMonth: true });
    const off = setChargeNextMonth(on, false);
    expect(off).toMatchObject({ dueDate: '2026-11-05', shiftedFrom: null, nextMonth: false });
  });

  test('fim de mês: 31/01 vai para 28/02 e volta para 31/01', () => {
    const on = setChargeNextMonth(base('2026-01-31'), true);
    expect(on.dueDate).toBe('2026-02-28');
    expect(setChargeNextMonth(on, false).dueDate).toBe('2026-01-31');
  });

  test('virada de ano', () => {
    expect(setChargeNextMonth(base('2026-12-10'), true).dueDate).toBe('2027-01-10');
  });

  test('mesmo valor não muda nada', () => {
    const d = base();
    expect(setChargeNextMonth(d, false)).toEqual(d);
    const on = setChargeNextMonth(d, true);
    expect(setChargeNextMonth(on, true)).toEqual(on);
  });

  test('data digitada vale como está', () => {
    const typed = withDueDate(setChargeNextMonth(base(), true), '2027-01-20');
    expect(typed).toMatchObject({ dueDate: '2027-01-20', shiftedFrom: null, nextMonth: true });
    expect(setChargeNextMonth(typed, false).dueDate).toBe('2026-12-20');
  });

  test('data inválida não quebra', () => {
    const d = setChargeNextMonth(withDueDate(base(), ''), true);
    expect(d).toMatchObject({ dueDate: '', nextMonth: true });
  });
});

describe('withCreateMethod', () => {
  test('Pix para cartão avança', () => {
    expect(withCreateMethod(base(), 'm-card', methods)).toMatchObject({ methodId: 'm-card', dueDate: '2026-12-05', nextMonth: true });
  });

  test('cartão para Pix restaura', () => {
    const d = withCreateMethod(base(), 'm-card', methods);
    expect(withCreateMethod(d, 'm-pix', methods)).toMatchObject({ dueDate: '2026-11-05', nextMonth: false });
  });

  test('cartão para sem método restaura', () => {
    const d = withCreateMethod(base(), 'm-card', methods);
    expect(withCreateMethod(d, '', methods)).toMatchObject({ methodId: '', dueDate: '2026-11-05', nextMonth: false });
  });

  test('cartão para outro cartão não avança duas vezes', () => {
    const d = withCreateMethod(base(), 'm-card', methods);
    expect(withCreateMethod(d, 'm-card2', methods)).toMatchObject({ dueDate: '2026-12-05', nextMonth: true });
  });

  test('a chave Pix é descartada ao sair de Pix', () => {
    const d = { ...base(), pixKey: 'chave' };
    expect(withCreateMethod(d, 'm-card', methods).pixKey).toBe('');
  });
});

describe('rascunho inicial', () => {
  test('emptyDraft e draftFromEntry começam com nextMonth false e shiftedFrom null', () => {
    expect(emptyDraft('2026-11-05', 'm-pix')).toMatchObject({ nextMonth: false, shiftedFrom: null });
    const entry = { displayName: 'Luz', amountCents: 100, dueDate: '2026-11-05', paymentMethodId: null, pixKey: null, seriesType: null, tagIds: [] } as unknown as EntryDTO;
    expect(draftFromEntry(entry)).toMatchObject({ nextMonth: false, shiftedFrom: null });
  });
});
