import { describe, expect, test } from 'vitest';
import type { EntryDTO, PaymentMethodDTO } from '@pluton/shared';
import { formatSort, nextSort, parseSort, sortEntries } from '../lib/sortEntries';

function e(id: string, displayName: string, amountCents = 100, dueDate = '2026-12-05', paymentMethodId: string | null = null) {
  return { id, displayName, amountCents, dueDate, paymentMethodId } as EntryDTO;
}

const methods = new Map<string, PaymentMethodDTO>([
  ['m-a', { id: 'm-a', name: 'Boleto', color: '#000000', sortOrder: 0 }],
  ['m-b', { id: 'm-b', name: 'Pix', color: '#000000', sortOrder: 1 }],
]);

const names = (rows: EntryDTO[]) => rows.map((r) => r.displayName);

describe('sortEntries', () => {
  test('null mantém a ordem recebida', () => {
    const rows = [e('1', 'B'), e('2', 'A')];
    expect(names(sortEntries(rows, null, methods))).toEqual(['B', 'A']);
  });

  test('nome-asc ignora acento e caixa, com número natural', () => {
    const rows = [e('1', 'Água'), e('2', 'agua 2'), e('3', 'Zelda'), e('4', 'Ágape')];
    expect(names(sortEntries(rows, parseSort('nome-asc'), methods))).toEqual(['Ágape', 'Água', 'agua 2', 'Zelda']);
  });

  test('nome com empate usa data e depois id', () => {
    const rows = [e('2', 'Luz', 1, '2026-12-10'), e('3', 'luz', 1, '2026-12-01'), e('1', 'Luz', 1, '2026-12-10')];
    expect(sortEntries(rows, parseSort('nome-asc'), methods).map((r) => r.id)).toEqual(['3', '1', '2']);
  });

  test('metodo-desc mantém sem método (e id desconhecido) por último', () => {
    const rows = [e('1', 'a', 1, '2026-12-05', null), e('2', 'b', 1, '2026-12-05', 'm-a'), e('3', 'c', 1, '2026-12-05', 'm-b'), e('4', 'd', 1, '2026-12-05', 'zzz')];
    expect(sortEntries(rows, parseSort('metodo-desc'), methods).map((r) => r.id)).toEqual(['3', '2', '1', '4']);
    expect(sortEntries(rows, parseSort('metodo-asc'), methods).map((r) => r.id)).toEqual(['2', '3', '1', '4']);
  });

  test('valor-asc com valores iguais desempata por data', () => {
    const rows = [e('1', 'a', 500, '2026-12-20'), e('2', 'b', 500, '2026-12-02'), e('3', 'c', 100, '2026-12-30')];
    expect(sortEntries(rows, parseSort('valor-asc'), methods).map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(sortEntries(rows, parseSort('valor-desc'), methods).map((r) => r.id)).toEqual(['2', '1', '3']);
  });

  test('data ordena por vencimento e depois nome', () => {
    const rows = [e('1', 'Z', 1, '2026-12-05'), e('2', 'A', 1, '2026-12-05'), e('3', 'M', 1, '2026-12-01')];
    expect(names(sortEntries(rows, parseSort('data-asc'), methods))).toEqual(['M', 'A', 'Z']);
    expect(names(sortEntries(rows, parseSort('data-desc'), methods))).toEqual(['A', 'Z', 'M']);
  });

  test('não altera o array recebido', () => {
    const rows = [e('1', 'B'), e('2', 'A')];
    sortEntries(rows, parseSort('nome-asc'), methods);
    expect(names(rows)).toEqual(['B', 'A']);
  });
});

describe('parseSort / formatSort / nextSort', () => {
  test('valores inválidos ou antigos viram null', () => {
    expect(parseSort('foo')).toBeNull();
    expect(parseSort('valor')).toBeNull();
    expect(parseSort(null)).toBeNull();
    expect(parseSort('valor-up')).toBeNull();
  });

  test('ida e volta', () => {
    expect(parseSort('metodo-desc')).toEqual({ key: 'metodo', dir: 'desc' });
    expect(formatSort({ key: 'metodo', dir: 'desc' })).toBe('metodo-desc');
    expect(formatSort(null)).toBeNull();
  });

  test('ciclo asc → desc → null; outra coluna começa em asc', () => {
    const a = nextSort(null, 'nome');
    expect(a).toEqual({ key: 'nome', dir: 'asc' });
    const d = nextSort(a, 'nome');
    expect(d).toEqual({ key: 'nome', dir: 'desc' });
    expect(nextSort(d, 'nome')).toBeNull();
    expect(nextSort(d, 'valor')).toEqual({ key: 'valor', dir: 'asc' });
  });
});
