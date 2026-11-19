import type { EntryDTO, TagDTO } from '@pluton/shared';
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
  return api('/api/tags', { method: 'POST', body: JSON.stringify(body) }, cookie);
}

function patch(id: string, body: unknown) {
  return api(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, cookie);
}

async function list() {
  return json<TagDTO[]>(api('/api/tags', undefined, cookie));
}

test('lista a etiqueta de sistema Assinatura logo após o cadastro', async () => {
  expect(await list()).toEqual([
    { id: expect.any(String), name: 'Assinatura', color: '#D9730D', sortOrder: 0, system: 'SUBSCRIPTION' },
  ]);
});

test('sem sessão → 401', async () => {
  expect((await api('/api/tags')).status).toBe(401);
});

test('cria com trim, sortOrder = max + 1 e system null', async () => {
  const res = await post({ name: '  Streaming ', color: '#0B6E99' });
  expect(res.status).toBe(201);
  expect(await json(res)).toEqual({
    id: expect.any(String),
    name: 'Streaming',
    color: '#0B6E99',
    sortOrder: 1,
    system: null,
  });
  expect((await list()).map((t) => t.name)).toEqual(['Assinatura', 'Streaming']);
});

test('nome duplicado sem diferenciar maiúsculas → 409', async () => {
  expect((await post({ name: 'Streaming', color: '#0B6E99' })).status).toBe(201);
  const res = await post({ name: 'streaming', color: '#0B6E99' });
  expect(res.status).toBe(409);
  expect(await json(res)).toEqual({ error: 'duplicate_name' });
});

test('corpo inválido → 400', async () => {
  expect((await post({ name: 'x'.repeat(41), color: '#0B6E99' })).status).toBe(400);
  expect((await post({ name: 'x'.repeat(40), color: '#0B6E99' })).status).toBe(201);
  expect((await post({ name: 'Ok', color: 'blue' })).status).toBe(400);
  expect((await post({ name: '   ', color: '#0B6E99' })).status).toBe(400);
});

test('renomear só a caixa da própria etiqueta é aceito e preserva system', async () => {
  const [assinatura] = await list();
  const res = await patch(assinatura!.id, { name: 'assinatura', color: '#E03E3E' });
  expect(res.status).toBe(200);
  expect(await json(res)).toEqual({
    ...assinatura,
    name: 'assinatura',
    color: '#E03E3E',
    system: 'SUBSCRIPTION',
  });
});

test('renomear para o nome de outra etiqueta com outra caixa → 409', async () => {
  const created = await json<TagDTO>(await post({ name: 'Streaming', color: '#0B6E99' }));
  const res = await patch(created.id, { name: 'ASSINATURA', color: '#0B6E99' });
  expect(res.status).toBe(409);
  expect(await json(res)).toEqual({ error: 'duplicate_name' });
});

test('excluir a etiqueta de sistema → 409 system_tag', async () => {
  const [assinatura] = await list();
  const res = await api(`/api/tags/${assinatura!.id}`, { method: 'DELETE' }, cookie);
  expect(res.status).toBe(409);
  expect(await json(res)).toEqual({ error: 'system_tag' });
  expect(await list()).toHaveLength(1);
});

test('excluir etiqueta comum → 204 e some dos tagIds dos lançamentos', async () => {
  const user = await prisma.user.findFirstOrThrow();
  const tag = await json<TagDTO>(await post({ name: 'Streaming', color: '#0B6E99' }));
  const entry = await prisma.entry.create({
    data: {
      userId: user.id,
      kind: 'EXPENSE',
      name: 'Netflix',
      amountCents: 4590,
      dueDate: new Date('2026-12-05T00:00:00.000Z'),
      tags: { create: { tag: { connect: { id: tag.id } } } },
    },
  });
  expect(await prisma.entryTag.count({ where: { entryId: entry.id } })).toBe(1);

  const res = await api(`/api/tags/${tag.id}`, { method: 'DELETE' }, cookie);
  expect(res.status).toBe(204);
  expect(await prisma.entryTag.count({ where: { entryId: entry.id } })).toBe(0);
  expect(await prisma.entry.count({ where: { id: entry.id } })).toBe(1);
  expect((await list()).map((t) => t.name)).toEqual(['Assinatura']);

  const entries = await json<EntryDTO[]>(api('/api/entries?kind=EXPENSE&from=2026-12&to=2026-12', undefined, cookie));
  expect(entries.find((e) => e.id === entry.id)?.tagIds).toEqual([]);
});

test('etiqueta de outro usuário → 404 em PATCH e DELETE', async () => {
  const other = await prisma.user.create({
    data: { id: 'outro-usuario', name: 'Outra', email: 'outra@example.com' },
  });
  const foreign = await prisma.tag.create({
    data: { userId: other.id, name: 'Alheia', color: '#0B6E99', sortOrder: 0 },
  });

  const patched = await patch(foreign.id, { name: 'Minha', color: '#0B6E99' });
  expect(patched.status).toBe(404);
  expect(await json(patched)).toEqual({ error: 'not_found' });
  expect((await api(`/api/tags/${foreign.id}`, { method: 'DELETE' }, cookie)).status).toBe(404);
  expect(await prisma.tag.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ name: 'Alheia' });
});
