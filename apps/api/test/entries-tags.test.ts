import type { EntryDTO, TagDTO } from '@pluton/shared';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { prisma } from '../src/db';
import { setEntryTags } from '../src/services/tags';
import { api, json, resetDb, signUpAndGetCookie } from './helpers';

let cookie: string;
let t1: string;
let t2: string;

/** "Agora" dos testes: 2026-11-18 12:00 em São Paulo. */
const NOW = new Date('2026-11-18T15:00:00Z');

beforeEach(async () => {
  // Só o Date é falso: timers reais continuam funcionando para pg/Prisma.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await resetDb();
  cookie = await signUpAndGetCookie();
  t1 = (await createTag('Casa')).id;
  t2 = (await createTag('Lazer')).id;
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => prisma.$disconnect());

async function createTag(name: string): Promise<TagDTO> {
  const res = await api('/api/tags', { method: 'POST', body: JSON.stringify({ name, color: '#0B6E99' }) }, cookie);
  expect(res.status).toBe(201);
  return json<TagDTO>(res);
}

async function createOk(body: Record<string, unknown>): Promise<EntryDTO[]> {
  const res = await api(
    '/api/entries',
    { method: 'POST', body: JSON.stringify({ kind: 'EXPENSE', amountCents: 1000, ...body }) },
    cookie,
  );
  expect(res.status).toBe(201);
  return json<EntryDTO[]>(res);
}

function patch(id: string, body: Record<string, unknown>) {
  return api(`/api/entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, cookie);
}

async function patchOk(id: string, body: Record<string, unknown>): Promise<EntryDTO[]> {
  const res = await patch(id, body);
  expect(res.status).toBe(200);
  return json<EntryDTO[]>(res);
}

async function pay(id: string): Promise<void> {
  const res = await api(`/api/entries/${id}/pay`, { method: 'POST', body: JSON.stringify({ paid: true }) }, cookie);
  expect(res.status).toBe(200);
}

/** Etiquetas de cada entrada da série, por sequência: `{ [sequence]: tagIds }`. */
async function tagsBySequence(seriesId: string): Promise<Record<number, string[]>> {
  const rows = await prisma.entry.findMany({
    where: { seriesId },
    orderBy: { sequence: 'asc' },
    select: { sequence: true, tags: { select: { tagId: true } } },
  });
  return Object.fromEntries(rows.map((r) => [r.sequence!, r.tags.map((t) => t.tagId).sort()]));
}

/** Etiquetas de uma entrada direto do banco. */
async function entryTagIds(entryId: string): Promise<string[]> {
  const rows = await prisma.entryTag.findMany({ where: { entryId }, select: { tagId: true } });
  return rows.map((r) => r.tagId);
}

function bySeq(entries: EntryDTO[], sequence: number): EntryDTO {
  const found = entries.find((e) => e.sequence === sequence);
  if (!found) throw new Error(`sequência ${sequence} não encontrada`);
  return found;
}

/** Série mensal "Aluguel" a partir de 2026-11-10 (materializada até 2027-11: sequências 1..13). */
async function seedMonthly() {
  const entries = await createOk({ name: 'Aluguel', dueDate: '2026-11-10', monthly: true });
  return { entries, seriesId: entries[0]!.seriesId! };
}

test('avulsa: aplica e limpa as etiquetas direto', async () => {
  const [entry] = await createOk({ name: 'Mercado', dueDate: '2026-11-20' });
  const tagged = await patchOk(entry!.id, { tagIds: [t1] });
  expect(tagged.map((e) => e.tagIds)).toEqual([[t1]]);
  const cleared = await patchOk(entry!.id, { tagIds: [] });
  expect(cleared.map((e) => e.tagIds)).toEqual([[]]);
});

test('tagIds inválidos → 400 invalid_body; etiqueta de outro usuário → 400 invalid_tag', async () => {
  const [entry] = await createOk({ name: 'Mercado', dueDate: '2026-11-20' });

  const repeated = await patch(entry!.id, { tagIds: [t1, t1] });
  expect(repeated.status).toBe(400);
  expect(await json(repeated)).toEqual({ error: 'invalid_body' });

  const tooMany = await patch(entry!.id, { tagIds: Array.from({ length: 21 }, (_, i) => `tag-${i}`) });
  expect(tooMany.status).toBe(400);
  expect(await json(tooMany)).toEqual({ error: 'invalid_body' });

  const empty = await patch(entry!.id, { tagIds: [''] });
  expect(empty.status).toBe(400);

  // Outra usuária (o cadastro só aceita uma, então vai direto no banco) com a própria etiqueta.
  const other = await prisma.user.create({ data: { id: 'outra-usuaria', name: 'Outra', email: 'outra@example.com' } });
  const foreign = await prisma.tag.create({
    data: { userId: other.id, name: 'Alheia', color: '#0B6E99', sortOrder: 0 },
  });

  const stolen = await patch(entry!.id, { tagIds: [t1, foreign.id] });
  expect(stolen.status).toBe(400);
  expect(await json(stolen)).toEqual({ error: 'invalid_tag' });
  expect(await entryTagIds(entry!.id)).toEqual([]);
});

test('série mensal sem scope → 400 scope_required', async () => {
  const { entries } = await seedMonthly();
  const res = await patch(bySeq(entries, 2).id, { tagIds: [t1] });
  expect(res.status).toBe(400);
  expect(await json(res)).toEqual({ error: 'scope_required' });
});

test('mesmo conjunto de etiquetas sem scope não é mudança → 200', async () => {
  const { entries, seriesId } = await seedMonthly();
  const second = bySeq(entries, 2);
  await patchOk(second.id, { tagIds: [t1, t2], scope: 'this' });
  const same = await patchOk(second.id, { tagIds: [t2, t1] });
  expect(same.map((e) => e.tagIds)).toEqual([[t1, t2]]);
  expect((await tagsBySequence(seriesId))[2]).toEqual([t1, t2].sort());
});

test("scope 'this' na 2ª entrada: só ela muda e a série não ganha etiqueta", async () => {
  const { entries, seriesId } = await seedMonthly();
  const changed = await patchOk(bySeq(entries, 2).id, { tagIds: [t1], scope: 'this' });
  expect(changed.map((e) => [e.sequence, e.tagIds])).toEqual([[2, [t1]]]);

  const tags = await tagsBySequence(seriesId);
  for (const [seq, ids] of Object.entries(tags)) expect(ids).toEqual(seq === '2' ? [t1] : []);
  expect(await prisma.seriesTag.count({ where: { seriesId } })).toBe(0);
});

test("etiqueta em entrada paga com scope 'this' → aplicada", async () => {
  const { entries } = await seedMonthly();
  const first = bySeq(entries, 1);
  await pay(first.id);
  const changed = await patchOk(first.id, { tagIds: [t1], scope: 'this' });
  expect(changed.map((e) => [e.paidOn, e.tagIds])).toEqual([['2026-11-18', [t1]]]);
});

test("scope 'following' na 2ª com a 3ª paga: 2ª e 4ª+ recebem, 3ª não; horizonte novo herda", async () => {
  const { entries, seriesId } = await seedMonthly();
  await pay(bySeq(entries, 3).id);

  const changed = await patchOk(bySeq(entries, 2).id, { tagIds: [t1], scope: 'following' });
  expect(changed.map((e) => e.sequence)).toEqual([2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  expect(changed.every((e) => e.tagIds.length === 1 && e.tagIds[0] === t1)).toBe(true);

  const tags = await tagsBySequence(seriesId);
  expect(tags[1]).toEqual([]);
  expect(tags[2]).toEqual([t1]);
  expect(tags[3]).toEqual([]);
  for (let seq = 4; seq <= 13; seq++) expect(tags[seq]).toEqual([t1]);
  expect(await prisma.seriesTag.findMany({ where: { seriesId }, select: { tagId: true } })).toEqual([
    { tagId: t1 },
  ]);

  // Mês 14 meses à frente (2028-01): a materialização gera 2027-12 e 2028-01.
  const res = await api('/api/entries?kind=EXPENSE&from=2028-01&to=2028-01', undefined, cookie);
  expect(res.status).toBe(200);
  const listed = await json<EntryDTO[]>(res);
  expect(listed.map((e) => [e.sequence, e.tagIds])).toEqual([[15, [t1]]]);
  const after = await tagsBySequence(seriesId);
  expect(after[14]).toEqual([t1]);
  expect(after[15]).toEqual([t1]);
});

test("parcelada: etiqueta via 'following' e total mudado para 5 → parcelas 4 e 5 herdam", async () => {
  const entries = await createOk({ name: 'Fone 1/3', amountCents: 15990, dueDate: '2026-11-05' });
  const seriesId = entries[0]!.seriesId!;
  await patchOk(bySeq(entries, 1).id, { tagIds: [t1], scope: 'following' });

  const changed = await patchOk(bySeq(entries, 1).id, { name: 'Fone 1/5', scope: 'following' });
  expect(changed.map((e) => [e.displayName, e.tagIds])).toEqual([
    ['Fone 1/5', [t1]],
    ['Fone 2/5', [t1]],
    ['Fone 3/5', [t1]],
    ['Fone 4/5', [t1]],
    ['Fone 5/5', [t1]],
  ]);
  expect(await tagsBySequence(seriesId)).toEqual({ 1: [t1], 2: [t1], 3: [t1], 4: [t1], 5: [t1] });
});

test('parcelada: etiqueta e total novo na mesma edição → todas herdam', async () => {
  const entries = await createOk({ name: 'Fone 1/3', amountCents: 15990, dueDate: '2026-11-05' });
  const seriesId = entries[0]!.seriesId!;
  await pay(bySeq(entries, 1).id);

  await patchOk(bySeq(entries, 2).id, { tagIds: [t2], name: 'Fone 2/5', scope: 'following' });
  expect(await tagsBySequence(seriesId)).toEqual({ 1: [], 2: [t2], 3: [t2], 4: [t2], 5: [t2] });
});

test('setEntryTags com onlyUnpaid ignora entradas pagas mesmo quando recebe o id delas', async () => {
  const { entries } = await seedMonthly();
  const [first, second] = [bySeq(entries, 1), bySeq(entries, 2)];
  await pay(first.id);
  await prisma.$transaction((tx) => setEntryTags(tx, [first.id, second.id], [t1], { onlyUnpaid: true }));
  expect(await entryTagIds(first.id)).toEqual([]);
  expect(await entryTagIds(second.id)).toEqual([t1]);
});
