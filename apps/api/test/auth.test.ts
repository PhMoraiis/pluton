import type { PaymentMethodDTO } from '@pluton/shared';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { prisma } from '../src/db';
import { api, json, resetDb, signUpAndGetCookie } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

test('setup-status sem usuário', async () => {
  expect(await json(api('/api/setup-status'))).toEqual({ hasUser: false });
});

test('primeiro cadastro funciona e cria os 5 métodos iniciais', async () => {
  const cookie = await signUpAndGetCookie();

  expect(await json(api('/api/setup-status'))).toEqual({ hasUser: true });

  const res = await api('/api/payment-methods', undefined, cookie);
  expect(res.status).toBe(200);
  const methods = await json<PaymentMethodDTO[]>(res);
  expect(methods.map((m) => m.name)).toEqual([
    'Pix',
    'Cartão de crédito',
    'Débito',
    'Boleto',
    'Dinheiro',
  ]);
  expect(methods.map((m) => m.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  for (const m of methods) expect(m.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
});

test('segundo cadastro é recusado', async () => {
  await signUpAndGetCookie();

  const res = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: 'Outra', email: 'outra@example.com', password: 'outra-senha-123' }),
  });

  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  expect(await prisma.user.count()).toBe(1);
});

test('rota protegida sem cookie → 401', async () => {
  const res = await api('/api/payment-methods');
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'unauthorized' });
});
