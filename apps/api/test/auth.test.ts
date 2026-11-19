import type { PaymentMethodDTO } from '@pluton/shared';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/db';
import { api, json, resetDb, signUpAndGetCookie, TEST_USER } from './helpers';

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

  const tags = await prisma.tag.findMany();
  expect(tags).toHaveLength(1);
  expect(tags[0]).toMatchObject({ name: 'Assinatura', system: 'SUBSCRIPTION', sortOrder: 0 });
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

test('POST de auth acima de 64 KB → 413 (sem chegar ao Better Auth)', async () => {
  const res = await api('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: 'teste@example.com', password: 'x'.repeat(65 * 1024) }),
  });
  expect(res.status).toBe(413);
  expect(await res.json()).toEqual({ error: 'payload_too_large' });
});

test('POST de outra rota da API acima de 64 KB → 413', async () => {
  const cookie = await signUpAndGetCookie();
  const res = await api(
    '/api/entries',
    {
      method: 'POST',
      body: JSON.stringify({ kind: 'EXPENSE', name: 'x'.repeat(65 * 1024), amountCents: 100, dueDate: '2026-12-05' }),
    },
    cookie,
  );
  expect(res.status).toBe(413);
});

test('recuperação de senha do runbook (docs/deploy.md): hash de better-auth/crypto em account.password permite entrar', async () => {
  await signUpAndGetCookie();
  const signIn = (password: string) =>
    api('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: TEST_USER.email, password }) });

  // Mesmo procedimento do runbook: hash gerado fora do app e gravado direto no banco.
  const hash = await hashPassword('senha-nova-ficticia-456');
  const updated = await prisma.$executeRaw`UPDATE "account" SET password = ${hash} WHERE "providerId" = 'credential'`;
  expect(updated).toBe(1);

  expect((await signIn('senha-nova-ficticia-456')).status).toBe(200);
  expect((await signIn(TEST_USER.password)).status).toBe(401);
});
