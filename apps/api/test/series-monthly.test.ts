import type { EntryDTO, MonthlySeriesDTO, TagDTO } from '@pluton/shared';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { prisma } from '../src/db';
import { api, json, resetDb, signUpAndGetCookie } from './helpers';

let cookie: string;

/** "Agora" dos testes: 2026-11-18 12:00 em São Paulo. */
const NOW = new Date('2026-11-18T15:00:00Z');

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

async function create(body: Record<string, unknown>): Promise<EntryDTO[]> {
  const res = await api(
    '/api/entries',
    { method: 'POST', body: JSON.stringify({ kind: 'EXPENSE', amountCents: 1000, ...body }) },
    cookie,
  );
  expect(res.status).toBe(201);
  return json<EntryDTO[]>(res);
}

async function listMonthly(kind: string, who = cookie): Promise<MonthlySeriesDTO[]> {
  const res = await api(`/api/series/monthly?kind=${kind}`, undefined, who);
  expect(res.status).toBe(200);
  return json<MonthlySeriesDTO[]>(res);
}

/** `who: null` = sem cookie (`undefined` cairia no padrão e mandaria o cookie). */
function putTags(seriesId: string, body: unknown, who: string | null = cookie) {
  return api(`/api/series/${seriesId}/tags`, { method: 'PUT', body: JSON.stringify(body) }, who ?? undefined);
}

async function createTag(name: string): Promise<string> {
  const res = await api('/api/tags', { method: 'POST', body: JSON.stringify({ name, color: '#0B6E99' }) }, cookie);
  expect(res.status).toBe(201);
  return (await json<TagDTO>(res)).id;
}

async function fixtures() {
  const spotify = (await create({ name: 'Spotify', amountCents: 2190, dueDate: '2026-11-10', monthly: true }))[0]!;
  const ended = (await create({ name: 'Antiga', dueDate: '2026-11-12', monthly: true }))[0]!;
  const end = await api(
    `/api/series/${ended.seriesId}/end`,
    { method: 'POST', body: JSON.stringify({ lastMonth: '2026-11' }) },
    cookie,
  );
  expect(end.status).toBe(204);
  await create({ name: 'Fone 1/3', dueDate: '2026-11-05' });
  await create({ name: 'Salário Extra', kind: 'INCOME', dueDate: '2026-11-05', monthly: true });
  return { spotify };
}

test('GET /monthly lista só as mensais ativas do kind, com valor do mês atual', async () => {
  await fixtures();
  const list = await listMonthly('EXPENSE');
  expect(list).toEqual([
    {
      id: expect.any(String),
      name: 'Spotify',
      kind: 'EXPENSE',
      amountCents: 2190,
      currentMonthCents: 2190,
      paymentMethodId: null,
      tagIds: [],
    },
  ]);
  const income = await listMonthly('INCOME');
  expect(income.map((s) => s.name)).toEqual(['Salário Extra']);
});

test('currentMonthCents reflete a edição "só este" do mês atual', async () => {
  const { spotify } = await fixtures();
  const res = await api(
    `/api/entries/${spotify.id}`,
    { method: 'PATCH', body: JSON.stringify({ amountCents: 2390, scope: 'this' }) },
    cookie,
  );
  expect(res.status).toBe(200);
  const [s] = await listMonthly('EXPENSE');
  expect(s).toMatchObject({ amountCents: 2190, currentMonthCents: 2390 });
});

test('GET /monthly valida kind e exige sessão', async () => {
  expect((await api('/api/series/monthly?kind=FOO', undefined, cookie)).status).toBe(400);
  expect((await api('/api/series/monthly?kind=EXPENSE')).status).toBe(401);
});

test('PUT /:id/tags aplica nas entradas não pagas do mês atual em diante e preserva as pagas', async () => {
  const { spotify } = await fixtures();
  const seriesId = spotify.seriesId!;
  const tag = await createTag('Assinatura extra');
  // A entrada do mês atual é paga: não deve receber a etiqueta.
  const pay = await api(
    `/api/entries/${spotify.id}/pay`,
    { method: 'POST', body: JSON.stringify({ paid: true }) },
    cookie,
  );
  expect(pay.status).toBe(200);
  const paid = { id: spotify.id };

  const res = await putTags(seriesId, { tagIds: [tag] });
  expect(res.status).toBe(200);
  expect((await json<MonthlySeriesDTO>(res)).tagIds).toEqual([tag]);

  const rows = await prisma.entry.findMany({
    where: { seriesId },
    select: { id: true, dueDate: true, tags: { select: { tagId: true } } },
  });
  expect(rows.length).toBeGreaterThan(2);
  for (const r of rows) {
    expect(r.tags.map((t) => t.tagId)).toEqual(r.id === paid.id ? [] : [tag]);
  }
  expect((await listMonthly('EXPENSE'))[0]!.tagIds).toEqual([tag]);

  // Limpar remove de tudo que não está pago.
  const cleared = await putTags(seriesId, { tagIds: [] });
  expect((await json<MonthlySeriesDTO>(cleared)).tagIds).toEqual([]);
  expect(await prisma.entryTag.count({ where: { entry: { seriesId } } })).toBe(0);
});

test('PUT /:id/tags: parcelada 400 not_monthly, outra conta 404, sem cookie 401, corpo/etiqueta inválidos 400', async () => {
  const { spotify } = await fixtures();
  const inst = (await create({ name: 'Fone 1/3', dueDate: '2026-11-05' }))[0]!;
  const r1 = await putTags(inst.seriesId!, { tagIds: [] });
  expect(r1.status).toBe(400);
  expect(await json(r1)).toEqual({ error: 'not_monthly' });

  const other = await prisma.user.create({
    data: { id: 'outro-usuario', name: 'Outra', email: 'outra@example.com' },
  });
  const foreign = await prisma.series.create({
    data: {
      userId: other.id,
      kind: 'EXPENSE',
      type: 'MONTHLY',
      baseName: 'Alheia',
      dayOfMonth: 5,
      amountCents: 500,
    },
  });
  expect((await putTags(foreign.id, { tagIds: [] })).status).toBe(404);
  expect((await putTags(spotify.seriesId!, { tagIds: [] }, null)).status).toBe(401);

  const bad = await putTags(spotify.seriesId!, { tagIds: ['nao-existe'] });
  expect(bad.status).toBe(400);
  expect(await json(bad)).toEqual({ error: 'invalid_tag' });
  expect((await putTags(spotify.seriesId!, { tagIds: 'x' })).status).toBe(400);
});
