import type { PaymentMethodDTO } from '@pluton/shared';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { prisma } from '../src/db';
import { api, json, resetDb, signUpAndGetCookie } from './helpers';

let cookie: string;

beforeEach(async () => {
  await resetDb();
  cookie = await signUpAndGetCookie();
});
afterAll(() => prisma.$disconnect());

function post(body: unknown) {
  return api('/api/payment-methods', { method: 'POST', body: JSON.stringify(body) }, cookie);
}

test('cria, renomeia e lista ordenado por sortOrder', async () => {
  const createRes = await post({ name: 'Vale-refeição', color: '#2B593F' });
  expect(createRes.status).toBe(201);
  const created = await json<PaymentMethodDTO>(createRes);
  expect(created).toEqual({
    id: expect.any(String),
    name: 'Vale-refeição',
    color: '#2B593F',
    sortOrder: 5,
  });

  const patchRes = await api(
    `/api/payment-methods/${created.id}`,
    { method: 'PATCH', body: JSON.stringify({ name: 'VR', color: '#28456C' }) },
    cookie,
  );
  expect(patchRes.status).toBe(200);
  expect(await json(patchRes)).toEqual({ ...created, name: 'VR', color: '#28456C' });

  const list = await json<PaymentMethodDTO[]>(api('/api/payment-methods', undefined, cookie));
  expect(list.map((m) => [m.name, m.sortOrder])).toEqual([
    ['Pix', 0],
    ['Cartão de crédito', 1],
    ['Débito', 2],
    ['Boleto', 3],
    ['Dinheiro', 4],
    ['VR', 5],
  ]);
});

test('nome duplicado → 409', async () => {
  const createRes = await post({ name: 'Pix', color: '#2B593F' });
  expect(createRes.status).toBe(409);

  const list = await json<PaymentMethodDTO[]>(api('/api/payment-methods', undefined, cookie));
  const boleto = list.find((m) => m.name === 'Boleto')!;
  const patchRes = await api(
    `/api/payment-methods/${boleto.id}`,
    { method: 'PATCH', body: JSON.stringify({ name: 'Pix', color: boleto.color }) },
    cookie,
  );
  expect(patchRes.status).toBe(409);
});

test('corpo inválido → 400', async () => {
  expect((await post({ name: '   ', color: '#2B593F' })).status).toBe(400);
  expect((await post({ name: 'X', color: 'azul' })).status).toBe(400);
});

test('método inexistente → 404', async () => {
  const res = await api('/api/payment-methods/nao-existe', { method: 'DELETE' }, cookie);
  expect(res.status).toBe(404);
});

test('excluir método em uso deixa a entry com paymentMethodId null', async () => {
  const user = await prisma.user.findFirstOrThrow();
  const pix = await prisma.paymentMethod.findFirstOrThrow({ where: { userId: user.id, name: 'Pix' } });
  const entry = await prisma.entry.create({
    data: {
      userId: user.id,
      kind: 'EXPENSE',
      name: 'Aluguel',
      amountCents: 150000,
      dueDate: new Date('2026-12-05T00:00:00.000Z'),
      paymentMethodId: pix.id,
    },
  });

  const res = await api(`/api/payment-methods/${pix.id}`, { method: 'DELETE' }, cookie);
  expect(res.status).toBe(204);

  const after = await prisma.entry.findUniqueOrThrow({ where: { id: entry.id } });
  expect(after.paymentMethodId).toBeNull();
  expect(await prisma.paymentMethod.count({ where: { id: pix.id } })).toBe(0);
});
