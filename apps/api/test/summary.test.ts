import { summarize, type EntryDTO, type Summary } from '@pluton/shared';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prisma } from '../src/db';
import { api, json, resetDb, signUpAndGetCookie } from './helpers';

let cookie: string;

/** "Agora" padrão dos testes: 2026-11-18 12:00 em São Paulo. */
const NOW = new Date('2026-11-18T15:00:00Z');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await resetDb();
  cookie = await signUpAndGetCookie();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => prisma.$disconnect());

async function create(body: Record<string, unknown>): Promise<EntryDTO[]> {
  const res = await api(
    '/api/entries',
    { method: 'POST', body: JSON.stringify({ kind: 'EXPENSE', ...body }) },
    cookie,
  );
  expect(res.status).toBe(201);
  return json<EntryDTO[]>(res);
}

async function pay(id: string): Promise<void> {
  const res = await api(`/api/entries/${id}/pay`, { method: 'POST', body: JSON.stringify({ paid: true }) }, cookie);
  expect(res.status).toBe(200);
}

function summary(query: string) {
  return api(`/api/summary?${query}`, undefined, cookie);
}

async function summaryOk(from: string, to: string): Promise<Summary> {
  const res = await summary(`from=${from}&to=${to}`);
  expect(res.status).toBe(200);
  return json<Summary>(res);
}

/** `summarize` sobre as entradas listadas pela própria API (ambos os tipos). */
async function expectedFromList(from: string, to: string): Promise<Summary> {
  const lists = await Promise.all(
    (['EXPENSE', 'INCOME'] as const).map((kind) =>
      json<EntryDTO[]>(api(`/api/entries?kind=${kind}&from=${from}&to=${to}&status=all`, undefined, cookie)),
    ),
  );
  return summarize(lists.flat());
}

/** Cenário: aluguel e salário mensais desde jan/2026, parcela "Fone 1/3" e uma avulsa paga. */
async function seed(): Promise<void> {
  const aluguel = await create({ name: 'Aluguel', amountCents: 150000, dueDate: '2026-01-05', monthly: true });
  const salario = await create({
    kind: 'INCOME',
    name: 'Salário',
    amountCents: 500000,
    dueDate: '2026-01-01',
    monthly: true,
  });
  await create({ name: 'Fone 1/3', amountCents: 30000, dueDate: '2026-12-10' });
  const [farmacia] = await create({ name: 'Farmácia', amountCents: 4500, dueDate: '2026-03-15' });
  await pay(aluguel.find((e) => e.dueDate === '2026-01-05')!.id);
  await pay(salario.find((e) => e.dueDate === '2026-01-01')!.id);
  await pay(farmacia!.id);
}

describe('GET /api/summary', () => {
  test('summary de 2026-12 a 2026-12 e de 2026-01 a 2026-06 batem com summarize sobre as entradas criadas', async () => {
    await seed();

    const dec = await summaryOk('2026-12', '2026-12');
    expect(dec).toEqual({
      expenseCents: 150000 + 30000,
      incomeCents: 500000,
      balanceCents: 500000 - 180000,
      realizedCents: 0,
    });
    expect(dec).toEqual(await expectedFromList('2026-12', '2026-12'));

    const half = await summaryOk('2026-01', '2026-06');
    expect(half).toEqual({
      expenseCents: 6 * 150000 + 4500,
      incomeCents: 6 * 500000,
      balanceCents: 6 * 500000 - (6 * 150000 + 4500),
      realizedCents: 500000 - 150000 - 4500,
    });
    expect(half).toEqual(await expectedFromList('2026-01', '2026-06'));
  });

  test('materializa séries mensais até `to` antes de somar', async () => {
    await seed();
    // 2028-03 está além do horizonte padrão (2027-11): precisa materializar.
    expect(await summaryOk('2028-03', '2028-03')).toEqual({
      expenseCents: 150000,
      incomeCents: 500000,
      balanceCents: 350000,
      realizedCents: 0,
    });
  });

  test('mês sem lançamentos → zeros', async () => {
    expect(await summaryOk('2026-11', '2026-11')).toEqual({
      expenseCents: 0,
      incomeCents: 0,
      balanceCents: 0,
      realizedCents: 0,
    });
  });

  test('query inválida → 400', async () => {
    for (const query of ['from=2026-01', 'to=2026-01', 'from=2026-06&to=2026-01', 'from=2026-13&to=2026-13', '']) {
      const res = await summary(query);
      expect(res.status, query).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_query' });
    }
  });

  test('sem sessão → 401', async () => {
    const res = await api('/api/summary?from=2026-01&to=2026-01');
    expect(res.status).toBe(401);
  });
});
