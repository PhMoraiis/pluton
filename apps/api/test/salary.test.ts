import type { EntryDTO, SalaryDTO } from '@pluton/shared';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { prisma } from '../src/db';
import { api, json, resetDb, signUpAndGetCookie } from './helpers';

let cookie: string;

/** "Agora" dos testes: 2026-11-19 12:00 em São Paulo. */
const NOW = new Date('2026-11-19T15:00:00Z');

beforeEach(async () => {
  // Só o Date é falso: timers reais continuam funcionando para pg/Prisma.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await resetDb();
  cookie = await signUpAndGetCookie();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => prisma.$disconnect());

const BASE = { amountCents: 500000, dayOfMonth: 31, startMonth: '2026-11', paymentMethodId: null };

function putSalary(body: unknown) {
  return api('/api/salary', { method: 'PUT', body: JSON.stringify(body) }, cookie);
}

async function getSalary(): Promise<SalaryDTO | null> {
  const res = await api('/api/salary', undefined, cookie);
  expect(res.status).toBe(200);
  return json<SalaryDTO | null>(res);
}

async function incomes(from = '2026-11', to = '2027-02'): Promise<EntryDTO[]> {
  const res = await api(`/api/entries?kind=INCOME&from=${from}&to=${to}`, undefined, cookie);
  expect(res.status).toBe(200);
  return json<EntryDTO[]>(res);
}

function patch(id: string, body: Record<string, unknown>) {
  return api(`/api/entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, cookie);
}

/** Vencimento → entrada, para as asserções por mês. */
async function byMonth(): Promise<Record<string, EntryDTO>> {
  const list = await incomes();
  return Object.fromEntries(list.map((e) => [e.dueDate.slice(0, 7), e]));
}

function activeSalaryCount() {
  return prisma.series.count({ where: { role: 'SALARY', endedOn: null } });
}

test('configuração inicial: GET null, PUT cria a série e gera os meses com último dia', async () => {
  expect(await getSalary()).toBeNull();

  const res = await putSalary(BASE);
  expect(res.status).toBe(200);
  const salary = await json<SalaryDTO>(res);
  expect(salary).toEqual({
    seriesId: expect.any(String),
    amountCents: 500000,
    dayOfMonth: 31,
    paymentMethodId: null,
    startMonth: '2026-11',
  });

  const list = await incomes();
  expect(list.map((e) => e.dueDate)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  for (const e of list) {
    expect(e).toMatchObject({
      seriesId: salary.seriesId,
      seriesRole: 'SALARY',
      seriesType: 'MONTHLY',
      displayName: 'Salário',
      amountCents: 500000,
      amountAdjusted: false,
    });
  }
  expect(await getSalary()).toEqual(salary);
});

test('PUT aceita um método de pagamento do usuário e recusa um de outro', async () => {
  const method = await prisma.paymentMethod.findFirstOrThrow();
  const ok = await putSalary({ ...BASE, paymentMethodId: method.id });
  expect(ok.status).toBe(200);
  expect((await json<SalaryDTO>(ok)).paymentMethodId).toBe(method.id);
  expect((await incomes()).every((e) => e.paymentMethodId === method.id)).toBe(true);

  const bad = await putSalary({ ...BASE, paymentMethodId: 'nao-existe' });
  expect(bad.status).toBe(400);
  expect(await json(bad)).toEqual({ error: 'invalid_payment_method' });
});

test('mudança de estimativa: pagos intocados, ajustados preservam o valor, a data muda', async () => {
  await putSalary(BASE);
  let months = await byMonth();

  const pay = await api(
    `/api/entries/${months['2026-11']!.id}/pay`,
    { method: 'POST', body: JSON.stringify({ paid: true }) },
    cookie,
  );
  expect(pay.status).toBe(200);

  const adjust = await patch(months['2027-01']!.id, { amountCents: 530000, scope: 'this' });
  expect(adjust.status).toBe(200);
  expect((await json<EntryDTO[]>(adjust))[0]).toMatchObject({ amountCents: 530000, amountAdjusted: true });

  const method = await prisma.paymentMethod.findFirstOrThrow();
  const res = await putSalary({ ...BASE, amountCents: 520000, dayOfMonth: 5, paymentMethodId: method.id });
  expect(res.status).toBe(200);

  months = await byMonth();
  expect(months['2026-11']).toMatchObject({
    amountCents: 500000,
    dueDate: '2026-11-30',
    paidOn: '2026-11-19',
    paymentMethodId: null,
  });
  expect(months['2026-12']).toMatchObject({ amountCents: 520000, dueDate: '2026-12-05', paymentMethodId: method.id });
  expect(months['2027-01']).toMatchObject({
    amountCents: 530000,
    dueDate: '2027-01-05',
    amountAdjusted: true,
    paymentMethodId: method.id,
  });
  expect(months['2027-02']).toMatchObject({ amountCents: 520000, dueDate: '2027-02-05', paymentMethodId: method.id });

  expect(await getSalary()).toMatchObject({
    amountCents: 520000,
    dayOfMonth: 5,
    paymentMethodId: method.id,
    startMonth: '2026-11',
  });

  // Meses gerados depois seguem a nova cadência e o novo valor.
  const later = await incomes('2027-12', '2027-12');
  expect(later.map((e) => [e.dueDate, e.amountCents])).toEqual([['2027-12-05', 520000]]);
});

test('PUT com salário ativo ignora startMonth e mantém uma única série', async () => {
  const first = await json<SalaryDTO>(await putSalary(BASE));
  const second = await putSalary({ ...BASE, amountCents: 510000, startMonth: '2027-03' });
  expect(second.status).toBe(200);
  expect(await json<SalaryDTO>(second)).toMatchObject({
    seriesId: first.seriesId,
    amountCents: 510000,
    startMonth: '2026-11',
  });
  expect(await activeSalaryCount()).toBe(1);
  expect(await prisma.series.count({ where: { role: 'SALARY' } })).toBe(1);
});

test('PUTs simultâneos sem salário criam uma só série', async () => {
  const [a, b] = await Promise.all([putSalary(BASE), putSalary({ ...BASE, amountCents: 510000 })]);
  expect(a.status).toBe(200);
  expect(b.status).toBe(200);
  expect(await activeSalaryCount()).toBe(1);
  expect((await incomes()).length).toBe(4);
});

test('"esta e as próximas" na tabela: editada desmarca o ajuste, seguintes ajustadas mantêm o valor', async () => {
  await putSalary(BASE);
  let months = await byMonth();
  await patch(months['2027-01']!.id, { amountCents: 530000, scope: 'this' });

  const res = await patch(months['2026-12']!.id, { amountCents: 510000, scope: 'following' });
  expect(res.status).toBe(200);

  months = await byMonth();
  expect(months['2026-12']).toMatchObject({ amountCents: 510000, amountAdjusted: false });
  expect(months['2027-01']).toMatchObject({ amountCents: 530000, amountAdjusted: true });
  expect(months['2027-02']).toMatchObject({ amountCents: 510000, amountAdjusted: false });
  expect((await getSalary())!.amountCents).toBe(510000);
});

test('"esta e as próximas" com data: ajustadas mudam de data, mas não de valor', async () => {
  await putSalary(BASE);
  let months = await byMonth();
  await patch(months['2027-01']!.id, { amountCents: 530000, scope: 'this' });

  const res = await patch(months['2026-12']!.id, {
    amountCents: 510000,
    dueDate: '2026-12-10',
    scope: 'following',
  });
  expect(res.status).toBe(200);

  months = await byMonth();
  expect(months['2026-12']).toMatchObject({ amountCents: 510000, dueDate: '2026-12-10' });
  expect(months['2027-01']).toMatchObject({ amountCents: 530000, dueDate: '2027-01-10', amountAdjusted: true });
  expect(months['2027-02']).toMatchObject({ amountCents: 510000, dueDate: '2027-02-10' });
});

test('"esta e as próximas" na própria entrada ajustada devolve ela à estimativa', async () => {
  await putSalary(BASE);
  let months = await byMonth();
  await patch(months['2027-01']!.id, { amountCents: 530000, scope: 'this' });

  const res = await patch(months['2027-01']!.id, { amountCents: 515000, scope: 'following' });
  expect(res.status).toBe(200);

  months = await byMonth();
  expect(months['2026-12']).toMatchObject({ amountCents: 500000, amountAdjusted: false });
  expect(months['2027-01']).toMatchObject({ amountCents: 515000, amountAdjusted: false });
  expect(months['2027-02']).toMatchObject({ amountCents: 515000, amountAdjusted: false });
});

test('salário: "só esta" sem mudar o valor não marca ajuste', async () => {
  await putSalary(BASE);
  const months = await byMonth();
  const res = await patch(months['2026-12']!.id, { amountCents: 500000, note: 'bônus', scope: 'this' });
  expect(res.status).toBe(200);
  expect((await json<EntryDTO[]>(res))[0]).toMatchObject({ note: 'bônus', amountAdjusted: false });
});

test('validações do PUT', async () => {
  const past = await putSalary({ ...BASE, startMonth: '2026-10' });
  expect(past.status).toBe(400);
  expect(await json(past)).toEqual({ error: 'start_month_in_past' });

  for (const dayOfMonth of [0, 32, 1.5]) {
    const res = await putSalary({ ...BASE, dayOfMonth });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_body' });
  }
  for (const body of [
    { ...BASE, amountCents: 0 },
    { ...BASE, startMonth: '2026-13' },
    { ...BASE, paymentMethodId: undefined },
  ]) {
    expect((await putSalary(body)).status).toBe(400);
  }
  expect(await prisma.series.count()).toBe(0);
});

test('PUT com início futuro gera a partir do mês de início', async () => {
  const res = await putSalary({ ...BASE, dayOfMonth: 10, startMonth: '2027-01' });
  expect(res.status).toBe(200);
  expect((await json<SalaryDTO>(res)).startMonth).toBe('2027-01');
  expect((await incomes()).map((e) => e.dueDate)).toEqual(['2027-01-10', '2027-02-10']);
});

test('desativar e reativar: sobreposição com a série encerrada é recusada', async () => {
  const first = await json<SalaryDTO>(await putSalary(BASE));

  const del = await api('/api/salary?lastMonth=2026-12', { method: 'DELETE' }, cookie);
  expect(del.status).toBe(204);
  expect(await getSalary()).toBeNull();
  expect((await incomes('2026-11', '2027-12')).map((e) => e.dueDate)).toEqual(['2026-11-30', '2026-12-31']);

  const overlap = await putSalary({ ...BASE, startMonth: '2026-12' });
  expect(overlap.status).toBe(400);
  expect(await json(overlap)).toEqual({ error: 'overlaps_previous_salary' });

  const again = await putSalary({ ...BASE, startMonth: '2027-01' });
  expect(again.status).toBe(200);
  const second = await json<SalaryDTO>(again);
  expect(second.seriesId).not.toBe(first.seriesId);
  expect(second.startMonth).toBe('2027-01');
  expect(await activeSalaryCount()).toBe(1);
  expect((await incomes()).map((e) => [e.dueDate, e.seriesId])).toEqual([
    ['2026-11-30', first.seriesId],
    ['2026-12-31', first.seriesId],
    ['2027-01-31', second.seriesId],
    ['2027-02-28', second.seriesId],
  ]);
});

test('DELETE sem salário ativo → 404; lastMonth inválido → 400', async () => {
  const none = await api('/api/salary?lastMonth=2026-12', { method: 'DELETE' }, cookie);
  expect(none.status).toBe(404);
  await putSalary(BASE);
  for (const q of ['', '?lastMonth=2026-13', '?lastMonth=abc']) {
    const res = await api(`/api/salary${q}`, { method: 'DELETE' }, cookie);
    expect(res.status).toBe(400);
  }
  expect(await activeSalaryCount()).toBe(1);
});

test('sem cookie → 401', async () => {
  expect((await api('/api/salary')).status).toBe(401);
  expect((await api('/api/salary', { method: 'PUT', body: JSON.stringify(BASE) })).status).toBe(401);
  expect((await api('/api/salary?lastMonth=2026-12', { method: 'DELETE' })).status).toBe(401);
  expect(await prisma.series.count()).toBe(0);
});

test('série mensal comum: "só esta" no valor não marca ajuste', async () => {
  const created = await api(
    '/api/entries',
    {
      method: 'POST',
      body: JSON.stringify({ kind: 'EXPENSE', name: 'Spotify', amountCents: 2190, dueDate: '2026-11-10', monthly: true }),
    },
    cookie,
  );
  expect(created.status).toBe(201);
  const [first] = await json<EntryDTO[]>(created);
  const res = await patch(first!.id, { amountCents: 2500, scope: 'this' });
  expect(res.status).toBe(200);
  expect((await json<EntryDTO[]>(res))[0]).toMatchObject({
    amountCents: 2500,
    amountAdjusted: false,
    seriesRole: 'NONE',
  });
});
