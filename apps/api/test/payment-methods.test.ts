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
    chargeNextMonth: false,
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

function patch(id: string, body: unknown) {
  return api(`/api/payment-methods/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, cookie);
}

test('POST com chargeNextMonth true grava e devolve true', async () => {
  const res = await post({ name: 'Vale', color: '#2B593F', chargeNextMonth: true });
  expect(res.status).toBe(201);
  expect((await json<PaymentMethodDTO>(res)).chargeNextMonth).toBe(true);
});

test('PATCH { chargeNextMonth: true } liga e um PATCH seguinte só com { name, color } mantém true', async () => {
  const created = await json<PaymentMethodDTO>(post({ name: 'Vale', color: '#2B593F' }));
  expect(created.chargeNextMonth).toBe(false);

  const on = await json<PaymentMethodDTO>(patch(created.id, { name: 'Vale', color: '#2B593F', chargeNextMonth: true }));
  expect(on.chargeNextMonth).toBe(true);

  const renamed = await json<PaymentMethodDTO>(patch(created.id, { name: 'Vale 2', color: '#28456C' }));
  expect(renamed).toMatchObject({ name: 'Vale 2', color: '#28456C', chargeNextMonth: true });
});

test('chargeNextMonth não booleano ("sim") → 400 invalid_body', async () => {
  const res = await post({ name: 'Vale', color: '#2B593F', chargeNextMonth: 'sim' });
  expect(res.status).toBe(400);
  expect(await json(res)).toEqual({ error: 'invalid_body' });
});

test('conta nova: só "Cartão de crédito" vem com chargeNextMonth true', async () => {
  const list = await json<PaymentMethodDTO[]>(api('/api/payment-methods', undefined, cookie));
  expect(list.map((m) => [m.name, m.chargeNextMonth])).toEqual([
    ['Pix', false],
    ['Cartão de crédito', true],
    ['Débito', false],
    ['Boleto', false],
    ['Dinheiro', false],
  ]);
});
