import { readFileSync } from 'node:fs';
import type { ImportPlan } from '@pluton/shared';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prisma } from '../src/db';
import { NOTION_COLORS } from '../src/payment-method-defaults';
import { fromIsoDate, toIsoDate } from '../src/services/dto';
import { api, json, resetDb, signUpAndGetCookie } from './helpers';

/** Fixture fictícia (mesmo formato do export do Notion; nenhum dado real). */
const FIXTURE = readFileSync(
  new URL('../../../packages/shared/test/fixtures/notion-sample.csv', import.meta.url),
  'utf8',
);
const HEADER = 'Name,Amount,Created,Date,Mês,Notes,Pago,Payment Method,Receipt';

/** Linhas válidas da fixture (17 linhas − 3 inválidas). */
const FIXTURE_VALID_ROWS = 14;

let cookie: string;
let userId: string;

/** "Agora" padrão dos testes: 2026-11-18 12:00 em São Paulo. */
const NOW = new Date('2026-11-18T15:00:00Z');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await resetDb();
  cookie = await signUpAndGetCookie();
  userId = (await prisma.user.findFirstOrThrow()).id;
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => prisma.$disconnect());

type CommitResult = { created: number; duplicates: number; invalidSkipped: number };

function post(path: string, body: unknown, withCookie = true) {
  return api(
    `/api/import/${path}`,
    { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) },
    withCookie ? cookie : undefined,
  );
}

async function preview(body: Record<string, unknown>): Promise<ImportPlan> {
  const res = await post('preview', body);
  expect(res.status).toBe(200);
  return json<ImportPlan>(res);
}

async function commit(body: Record<string, unknown>): Promise<CommitResult> {
  const res = await post('commit', body);
  expect(res.status).toBe(200);
  return json<CommitResult>(res);
}

function plannedCount(plan: ImportPlan): number {
  return (
    plan.installmentSeries.reduce((n, s) => n + s.entries.length, 0) +
    plan.monthlySuggestions.reduce((n, s) => n + s.entries.length, 0) +
    plan.singles.length
  );
}

async function methodIds(): Promise<Record<string, string>> {
  const methods = await prisma.paymentMethod.findMany({ where: { userId } });
  return Object.fromEntries(methods.map((m) => [m.name, m.id]));
}

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join('\n');
}

describe('POST /api/import/preview', () => {
  test('monta o plano da fixture com existingKeys vazias', async () => {
    const plan = await preview({ csv: FIXTURE });
    expect(plan.installmentSeries.map((s) => [s.baseName, s.total, s.entries.length])).toEqual([
      ['Fone', 7, 7],
      ['Fone', 2, 2],
      ['Fone', 2, 2],
    ]);
    expect(plan.installmentSeries[0]!.entries.filter((e) => e.generated)).toHaveLength(4);
    expect(plan.monthlySuggestions.map((s) => [s.name, s.active, s.entries.length])).toEqual([
      ['Spotify', true, 4],
      ['Claro Flex', false, 3],
    ]);
    expect(plan.singles.map((s) => s.name)).toEqual(['Mercado, feira', 'Tenis']);
    expect(plan.invalid.map((r) => r.rowId)).toEqual([15, 16, 17]);
    expect(plan.duplicates).toBe(0);
  });

  test('aplica overrides e excludedRowIds', async () => {
    const plan = await preview({
      csv: FIXTURE,
      overrides: { '15': { dueDate: '2026-12-01' }, '17': { amountCents: 990 } },
      excludedRowIds: [16],
    });
    expect(plan.invalid).toEqual([]);
    expect(plan.singles.map((s) => [s.name, s.dueDate, s.amountCents])).toEqual([
      ['Mercado, feira', '2025-03-31', 123456],
      ['Brinde', '2025-05-03', 990],
      ['Tenis', '2026-10-20', 39900],
      ['Presente', '2026-12-01', 5000],
    ]);
  });

  test('body inválido → 400; sem sessão → 401', async () => {
    for (const body of [{}, { csv: 1 }, { csv: FIXTURE, excludedRowIds: ['x'] }, { csv: FIXTURE, overrides: { '1': { dueDate: '2026-02-30' } } }]) {
      const res = await post('preview', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_body' });
    }
    expect((await post('preview', { csv: FIXTURE }, false)).status).toBe(401);
  });

  test('import aceita body acima do limite geral de 64 KB', async () => {
    // CSV inválido mas grande: chega à validação/planejamento (não é barrado com 413).
    const res = await post('preview', { csv: 'x'.repeat(100 * 1024) });
    expect(res.status).not.toBe(413);
  });

  test('body acima de 2 MB → 413', async () => {
    const big = JSON.stringify({ csv: 'x'.repeat(2 * 1024 * 1024 + 10) });
    expect((await post('preview', big)).status).toBe(413);
    expect((await post('commit', big)).status).toBe(413);
  });
});

describe('POST /api/import/commit', () => {
  test('import da fixture cria séries completadas, mensais aceitas e avulsas; contagens batem com o preview', async () => {
    const plan = await preview({ csv: FIXTURE });
    const result = await commit({ csv: FIXTURE, acceptedMonthlyKeys: plan.monthlySuggestions.map((s) => s.key) });
    expect(result).toEqual({ created: plannedCount(plan), duplicates: 0, invalidSkipped: 3 });
    expect(result.created).toBe(20);

    const ids = await methodIds();
    const series = await prisma.series.findMany({
      where: { userId },
      include: { entries: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ baseName: 'asc' }, { amountCents: 'asc' }],
    });
    expect(series.map((s) => [s.type, s.baseName, s.totalInstallments])).toEqual([
      ['MONTHLY', 'Claro Flex', null],
      ['INSTALLMENT', 'Fone', 2],
      ['INSTALLMENT', 'Fone', 2],
      ['INSTALLMENT', 'Fone', 7],
      ['MONTHLY', 'Spotify', null],
    ]);
    const [claro, fone2a, fone2b, fone7, spotify] = series;

    // Parcelada completada: 1..3 importadas (1 e 2 pagas no vencimento), 4..7 geradas.
    expect(fone7!.dayOfMonth).toBe(5);
    expect(fone7!.amountCents).toBe(25470);
    expect(fone7!.paymentMethodId).toBe(ids['Cartão de crédito']);
    expect(
      fone7!.entries.map((e) => [e.sequence, toIsoDate(e.dueDate), e.paidOn && toIsoDate(e.paidOn), e.amountCents]),
    ).toEqual([
      [1, '2026-09-05', '2026-09-05', 25470],
      [2, '2026-10-05', '2026-10-05', 25470],
      [3, '2026-11-05', null, 25470],
      [4, '2026-12-05', null, 25470],
      [5, '2027-01-05', null, 25470],
      [6, '2027-02-05', null, 25470],
      [7, '2027-03-05', null, 25470],
    ]);
    expect(fone7!.entries.every((e) => e.name === 'Fone' && e.kind === 'EXPENSE')).toBe(true);
    expect(fone7!.entries.every((e) => e.paymentMethodId === ids['Cartão de crédito'])).toBe(true);

    // Mesma compra repetida (Fone 1/2 em 2025 e em 2026): duas séries, sem método.
    expect(fone2a!.entries.map((e) => [e.sequence, toIsoDate(e.dueDate), e.amountCents, e.paidOn !== null])).toEqual([
      [1, '2025-04-08', 10000, true],
      [2, '2025-05-08', 10000, false],
    ]);
    expect(fone2b!.entries.map((e) => [e.sequence, toIsoDate(e.dueDate), e.amountCents, e.paidOn !== null])).toEqual([
      [1, '2026-04-08', 12000, true],
      [2, '2026-05-08', 12000, false],
    ]);
    expect(fone2a!.paymentMethodId).toBeNull();

    // Mensal ativa: 4 importadas (seq 1..4) + materializadas até 2027-11.
    expect(spotify!.dayOfMonth).toBe(10);
    expect(spotify!.endedOn).toBeNull();
    expect(toIsoDate(spotify!.generatedThrough!)).toBe('2027-11-10');
    expect(spotify!.entries.slice(0, 4).map((e) => [e.sequence, toIsoDate(e.dueDate), e.paidOn !== null])).toEqual([
      [1, '2026-08-10', true],
      [2, '2026-09-10', true],
      [3, '2026-10-10', true],
      [4, '2026-11-10', false],
    ]);
    expect(spotify!.entries).toHaveLength(4 + 12);
    expect(spotify!.entries.every((e) => e.name === 'Spotify' && e.amountCents === 2190)).toBe(true);

    // Mensal inativa: encerrada no fim do mês da última ocorrência; nada materializado.
    // A materialização marca a geração como completa (generatedThrough = endedOn), então
    // os GETs seguintes nem abrem transação para ela.
    expect(toIsoDate(claro!.endedOn!)).toBe('2025-03-31');
    expect(toIsoDate(claro!.generatedThrough!)).toBe('2025-03-31');
    expect(claro!.entries.map((e) => toIsoDate(e.dueDate))).toEqual(['2025-01-15', '2025-02-15', '2025-03-15']);
    expect(claro!.paymentMethodId).toBe(ids['Pix']);

    const singles = await prisma.entry.findMany({ where: { userId, seriesId: null }, orderBy: { dueDate: 'asc' } });
    expect(singles.map((e) => [e.name, toIsoDate(e.dueDate), e.amountCents, e.paidOn && toIsoDate(e.paidOn), e.paymentMethodId])).toEqual([
      ['Mercado, feira', '2025-03-31', 123456, '2025-03-31', ids['Pix']],
      ['Tenis', '2026-10-20', 39900, '2026-10-20', ids['Dinheiro']],
    ]);
  });

  test('sugestões mensais não aceitas viram avulsas; chave desconhecida é ignorada', async () => {
    const plan = await preview({ csv: FIXTURE });
    const claroKey = plan.monthlySuggestions.find((s) => s.name === 'Claro Flex')!.key;
    const result = await commit({ csv: FIXTURE, acceptedMonthlyKeys: [claroKey, 'nao-existe|monthly|9'] });
    expect(result).toEqual({ created: 20, duplicates: 0, invalidSkipped: 3 });

    expect(await prisma.series.count({ where: { userId, type: 'MONTHLY' } })).toBe(1);
    const spotify = await prisma.entry.findMany({
      where: { userId, name: { equals: 'spotify', mode: 'insensitive' } },
      orderBy: { dueDate: 'asc' },
    });
    expect(spotify.map((e) => [e.name, toIsoDate(e.dueDate), e.seriesId, e.sequence])).toEqual([
      ['spotify', '2026-08-10', null, null],
      ['Spotify', '2026-09-10', null, null],
      ['Spotify', '2026-10-10', null, null],
      ['Spotify', '2026-11-10', null, null],
    ]);
  });

  test('importar a mesma fixture de novo → created 0, duplicates = total da 1ª', async () => {
    const plan = await preview({ csv: FIXTURE });
    const keys = plan.monthlySuggestions.map((s) => s.key);
    const first = await commit({ csv: FIXTURE, acceptedMonthlyKeys: keys });
    const totalBefore = await prisma.entry.count({ where: { userId } });

    const again = await preview({ csv: FIXTURE });
    expect(plannedCount(again)).toBe(0);
    expect(again.duplicates).toBe(FIXTURE_VALID_ROWS);

    const second = await commit({ csv: FIXTURE, acceptedMonthlyKeys: keys });
    expect(second).toEqual({ created: 0, duplicates: FIXTURE_VALID_ROWS, invalidSkipped: 3 });
    expect(first.created - 6).toBe(FIXTURE_VALID_ROWS); // 6 parcelas geradas na 1ª
    expect(await prisma.entry.count({ where: { userId } })).toBe(totalBefore);
  });

  test('dois commits simultâneos (clique duplo) não duplicam lançamentos', async () => {
    const body = { csv: FIXTURE, acceptedMonthlyKeys: [] };
    const results = await Promise.all([commit(body), commit(body)]);
    expect(results.map((r) => r.created).sort((a, b) => a - b)).toEqual([0, 20]);
    expect(await prisma.entry.count({ where: { userId } })).toBe(20);
  });

  test('"Cartão" vira "Cartão de crédito"; método "PicPay" desconhecido é criado', async () => {
    const result = await commit({
      csv: csv(
        'Lanche,"R$ 12,00",,1 de outubro de 2026,,,Yes,cartão,',
        'Livro,"R$ 45,00",,2 de outubro de 2026,,,No,PicPay,',
        'Cinema,"R$ 30,00",,3 de outubro de 2026,,,No,picpay,',
        'Feira,"R$ 80,00",,4 de outubro de 2026,,,No,PIX,',
        'Doação,"R$ 20,00",,5 de outubro de 2026,,,No,,',
      ),
      acceptedMonthlyKeys: [],
    });
    expect(result).toEqual({ created: 5, duplicates: 0, invalidSkipped: 0 });

    const methods = await prisma.paymentMethod.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
    expect(methods.map((m) => m.name)).toEqual(['Pix', 'Cartão de crédito', 'Débito', 'Boleto', 'Dinheiro', 'PicPay']);
    const picpay = methods.at(-1)!;
    expect(picpay.sortOrder).toBe(5);
    expect(picpay.color).toBe(NOTION_COLORS.gray);

    const ids = await methodIds();
    const entries = await prisma.entry.findMany({ where: { userId }, orderBy: { dueDate: 'asc' } });
    expect(entries.map((e) => [e.name, e.paymentMethodId])).toEqual([
      ['Lanche', ids['Cartão de crédito']],
      ['Livro', picpay.id],
      ['Cinema', picpay.id],
      ['Feira', ids['Pix']],
      ['Doação', null],
    ]);
  });

  test('linhas inválidas são puladas e contadas em invalidSkipped', async () => {
    const plan = await preview({ csv: FIXTURE });
    const result = await commit({ csv: FIXTURE, acceptedMonthlyKeys: plan.monthlySuggestions.map((s) => s.key) });
    expect(result.invalidSkipped).toBe(3);
    for (const name of ['Presente', 'Brinde']) {
      expect(await prisma.entry.count({ where: { userId, name } })).toBe(0);
    }
    expect(await prisma.entry.count({ where: { userId, amountCents: 1000 } })).toBe(0);

    // Corrigida via override e excluída via excludedRowIds: só o Brinde continua inválido.
    await resetDb();
    cookie = await signUpAndGetCookie();
    userId = (await prisma.user.findFirstOrThrow()).id;
    const fixed = await commit({
      csv: FIXTURE,
      acceptedMonthlyKeys: [],
      overrides: { '15': { dueDate: '2026-12-01' } },
      excludedRowIds: [16],
    });
    expect(fixed).toEqual({ created: 21, duplicates: 0, invalidSkipped: 1 });
    const presente = await prisma.entry.findFirstOrThrow({ where: { userId, name: 'Presente' } });
    expect(toIsoDate(presente.dueDate)).toBe('2026-12-01');
    expect(presente.paidOn).toBeNull();
  });

  test('notas do CSV viram a nota do lançamento', async () => {
    await commit({
      csv: csv('Conserto,"R$ 150,00",,6 de outubro de 2026,,"troca da tela",Yes,Pix,'),
      acceptedMonthlyKeys: [],
    });
    const entry = await prisma.entry.findFirstOrThrow({ where: { userId } });
    expect(entry.note).toBe('troca da tela');
    expect(toIsoDate(entry.paidOn!)).toBe('2026-10-06');
  });

  test('existingKeys só do usuário atual: entradas de outro usuário não contam como duplicata', async () => {
    const other = await prisma.user.create({ data: { id: 'outro-usuario', name: 'Outra', email: 'outra@example.com' } });
    await prisma.entry.create({
      data: { userId: other.id, kind: 'EXPENSE', name: 'Tenis', amountCents: 39900, dueDate: fromIsoDate('2026-10-20') },
    });
    const result = await commit({ csv: FIXTURE, acceptedMonthlyKeys: [] });
    expect(result).toEqual({ created: 20, duplicates: 0, invalidSkipped: 3 });
    expect(await prisma.entry.count({ where: { userId: other.id } })).toBe(1);
  });

  test('acceptedMonthlyKeys é obrigatório; sem sessão → 401', async () => {
    const res = await post('commit', { csv: FIXTURE });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
    expect((await post('commit', { csv: FIXTURE, acceptedMonthlyKeys: [] }, false)).status).toBe(401);
    expect(await prisma.entry.count()).toBe(0);
  });
});
