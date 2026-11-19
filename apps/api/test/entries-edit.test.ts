import type { EntryDTO, PaymentMethodDTO } from '@pluton/shared';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { prisma } from '../src/db';
import { api, json, resetDb, signUpAndGetCookie, TEST_USER } from './helpers';

let cookie: string;

/** "Agora" padrão dos testes: 2026-11-18 12:00 em São Paulo. */
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

type CreateBody = {
  kind?: 'EXPENSE' | 'INCOME';
  name: string;
  amountCents?: number;
  dueDate: string;
  paymentMethodId?: string | null;
  pixKey?: string | null;
  note?: string;
  monthly?: boolean;
};

function create(body: CreateBody | Record<string, unknown>) {
  return api(
    '/api/entries',
    { method: 'POST', body: JSON.stringify({ kind: 'EXPENSE', amountCents: 1000, ...body }) },
    cookie,
  );
}

async function createOk(body: CreateBody): Promise<EntryDTO[]> {
  const res = await create(body);
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

function del(id: string, scope?: string) {
  const query = scope === undefined ? '' : `?scope=${scope}`;
  return api(`/api/entries/${id}${query}`, { method: 'DELETE' }, cookie);
}

function endSeries(seriesId: string, body: Record<string, unknown>) {
  return api(`/api/series/${seriesId}/end`, { method: 'POST', body: JSON.stringify(body) }, cookie);
}

function list(query: string) {
  return api(`/api/entries?${query}`, undefined, cookie);
}

function pay(id: string) {
  return api(`/api/entries/${id}/pay`, { method: 'POST', body: JSON.stringify({ paid: true }) }, cookie);
}

/** Avança o relógio e renova a sessão (a do cadastro expira em 7 dias). */
async function jumpTo(now: Date): Promise<void> {
  vi.setSystemTime(now);
  const res = await api('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  expect(res.status).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Entradas da série direto do banco, por sequência: `[sequence, dueDate, amountCents, name, paidOn]`. */
async function seriesRows(seriesId: string) {
  const rows = await prisma.entry.findMany({ where: { seriesId }, orderBy: { sequence: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    sequence: r.sequence,
    dueDate: r.dueDate.toISOString().slice(0, 10),
    amountCents: r.amountCents,
    name: r.name,
    paidOn: r.paidOn ? r.paidOn.toISOString().slice(0, 10) : null,
    paymentMethodId: r.paymentMethodId,
    pixKey: r.pixKey,
    note: r.note,
  }));
}

function bySeq(entries: EntryDTO[], sequence: number): EntryDTO {
  const found = entries.find((e) => e.sequence === sequence);
  if (!found) throw new Error(`sequência ${sequence} não encontrada`);
  return found;
}

/** "Fone 1/7" a partir de 2026-11-05 (nov..mai), pagando as sequências informadas. */
async function seedFone(paidSequences: number[] = []) {
  const entries = await createOk({ name: 'Fone 1/7', amountCents: 15990, dueDate: '2026-11-05' });
  for (const seq of paidSequences) expect((await pay(bySeq(entries, seq).id)).status).toBe(200);
  return { entries, seriesId: entries[0]!.seriesId! };
}

async function paymentMethod(name: string): Promise<PaymentMethodDTO> {
  const methods = await json<PaymentMethodDTO[]>(api('/api/payment-methods', undefined, cookie));
  return methods.find((m) => m.name === name)!;
}

describe('PATCH /api/entries/:id', () => {
  test('mudar data da 4/7 para dia 10 com following: 4..7 não pagas vão para dia 10, pagas intocadas', async () => {
    const { entries, seriesId } = await seedFone([1, 2, 6]);
    const fourth = bySeq(entries, 4);
    expect(fourth.dueDate).toBe('2027-02-05');

    const changed = await patchOk(fourth.id, { scope: 'following', dueDate: '2027-02-10' });
    expect(changed.map((e) => [e.sequence, e.dueDate])).toEqual([
      [4, '2027-02-10'],
      [5, '2027-03-10'],
      [7, '2027-05-10'],
    ]);

    expect((await seriesRows(seriesId)).map((r) => [r.sequence, r.dueDate, r.paidOn])).toEqual([
      [1, '2026-11-05', '2026-11-18'],
      [2, '2026-12-05', '2026-11-18'],
      [3, '2027-01-05', null],
      [4, '2027-02-10', null],
      [5, '2027-03-10', null],
      [6, '2027-04-05', '2026-11-18'],
      [7, '2027-05-10', null],
    ]);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.dayOfMonth).toBe(10);
  });

  test('mudar valor com this: só a entrada muda, série mantém amountCents', async () => {
    const { entries, seriesId } = await seedFone();
    const third = bySeq(entries, 3);

    const changed = await patchOk(third.id, { scope: 'this', amountCents: 20000 });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ id: third.id, amountCents: 20000, displayName: 'Fone 3/7' });

    const rows = await seriesRows(seriesId);
    expect(rows.map((r) => r.amountCents)).toEqual([15990, 15990, 20000, 15990, 15990, 15990, 15990]);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.amountCents).toBe(15990);
  });

  test('mudar valor com following: entrada e seguintes não pagas mudam, série também', async () => {
    const { entries, seriesId } = await seedFone([5]);
    const changed = await patchOk(bySeq(entries, 3).id, { scope: 'following', amountCents: 17000 });
    expect(changed.map((e) => e.sequence)).toEqual([3, 4, 6, 7]);
    const rows = await seriesRows(seriesId);
    expect(rows.map((r) => r.amountCents)).toEqual([15990, 15990, 17000, 17000, 15990, 17000, 17000]);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.amountCents).toBe(17000);
  });

  test('editar série sem scope → 400', async () => {
    const { entries, seriesId } = await seedFone();
    const id = bySeq(entries, 3).id;
    for (const body of [
      { amountCents: 1 },
      { dueDate: '2027-01-10' },
      { name: 'Outro nome' },
      { paymentMethodId: (await paymentMethod('Pix')).id },
      { pixKey: 'chave-ficticia@example.com' },
    ]) {
      const res = await patch(id, body);
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'scope_required' });
    }
    expect((await seriesRows(seriesId)).every((r) => r.amountCents === 15990 && r.name === 'Fone')).toBe(true);

    // Só a nota (ou valores idênticos aos atuais) não exige scope.
    const ok = await patchOk(id, { note: 'presente', amountCents: 15990, dueDate: '2027-01-05' });
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ note: 'presente', amountCents: 15990 });
  });

  test('renomear "Fone 3/7" para "Fone Bluetooth 3/7" com following → base "Fone Bluetooth" nas não pagas seguintes, mesma série, mesma contagem de entradas', async () => {
    const { entries, seriesId } = await seedFone([1, 5]);
    const third = bySeq(entries, 3);

    const changed = await patchOk(third.id, { scope: 'following', name: 'Fone Bluetooth 3/7' });
    expect(changed.map((e) => e.displayName)).toEqual([
      'Fone Bluetooth 3/7',
      'Fone Bluetooth 4/7',
      'Fone Bluetooth 6/7',
      'Fone Bluetooth 7/7',
    ]);
    for (const e of changed) expect(e).toMatchObject({ name: 'Fone Bluetooth', seriesId, totalInstallments: 7 });

    expect(await prisma.series.count()).toBe(1);
    expect(await prisma.entry.count()).toBe(7);
    expect((await seriesRows(seriesId)).map((r) => r.name)).toEqual([
      'Fone',
      'Fone',
      'Fone Bluetooth',
      'Fone Bluetooth',
      'Fone',
      'Fone Bluetooth',
      'Fone Bluetooth',
    ]);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series).toMatchObject({ baseName: 'Fone Bluetooth', totalInstallments: 7 });
  });

  test('renomear parcela com this: só a entrada, sufixo x/y removido', async () => {
    const { entries, seriesId } = await seedFone();
    const changed = await patchOk(bySeq(entries, 2).id, { scope: 'this', name: 'Fone JBL 2 / 7' });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ name: 'Fone JBL', displayName: 'Fone JBL 2/7' });
    expect((await seriesRows(seriesId)).filter((r) => r.name !== 'Fone')).toHaveLength(1);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.baseName).toBe('Fone');
  });

  test('following aplica método de pagamento e chave Pix à série e às seguintes não pagas', async () => {
    const { entries, seriesId } = await seedFone([4]);
    const pix = await paymentMethod('Pix');
    const changed = await patchOk(bySeq(entries, 3).id, {
      scope: 'following',
      paymentMethodId: pix.id,
      pixKey: 'chave-ficticia@example.com',
    });
    expect(changed.map((e) => e.sequence)).toEqual([3, 5, 6, 7]);
    const rows = await seriesRows(seriesId);
    expect(rows.map((r) => r.paymentMethodId)).toEqual([null, null, pix.id, null, pix.id, pix.id, pix.id]);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series).toMatchObject({ paymentMethodId: pix.id, pixKey: 'chave-ficticia@example.com' });
  });

  test('R2: aumentar total ("Fone 3/9") gera as parcelas que faltam, mensais a partir da última', async () => {
    const { entries, seriesId } = await seedFone([1]);
    const changed = await patchOk(bySeq(entries, 3).id, { scope: 'following', name: 'Fone 3/9' });

    const rows = await seriesRows(seriesId);
    expect(rows.map((r) => [r.sequence, r.dueDate])).toEqual([
      [1, '2026-11-05'],
      [2, '2026-12-05'],
      [3, '2027-01-05'],
      [4, '2027-02-05'],
      [5, '2027-03-05'],
      [6, '2027-04-05'],
      [7, '2027-05-05'],
      [8, '2027-06-05'],
      [9, '2027-07-05'],
    ]);
    expect(rows.slice(7).every((r) => r.amountCents === 15990 && r.name === 'Fone' && r.paidOn === null)).toBe(true);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.totalInstallments).toBe(9);
    // Todas as entradas da série mudam de displayName ("x/9"), então todas voltam.
    expect(changed.map((e) => e.displayName)).toEqual(rows.map((r) => `Fone ${r.sequence}/9`));
  });

  test('R2: diminuir total ("Fone 3/5") apaga as não pagas acima de 5', async () => {
    const { entries, seriesId } = await seedFone([1]);
    const changed = await patchOk(bySeq(entries, 3).id, { scope: 'following', name: 'Fone 1/5' });
    const rows = await seriesRows(seriesId);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(changed.map((e) => e.displayName)).toEqual(['Fone 1/5', 'Fone 2/5', 'Fone 3/5', 'Fone 4/5', 'Fone 5/5']);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.totalInstallments).toBe(5);
  });

  test('R2: total abaixo da maior parcela paga → 400 e nada muda', async () => {
    const { entries, seriesId } = await seedFone([6]);
    const res = await patch(bySeq(entries, 3).id, { scope: 'following', name: 'Fone Novo 3/5' });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: expect.any(String) });
    expect((await seriesRows(seriesId)).map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series).toMatchObject({ totalInstallments: 7, baseName: 'Fone' });
  });

  test('R2: mudar total com this → 400', async () => {
    const { entries } = await seedFone();
    const res = await patch(bySeq(entries, 3).id, { scope: 'this', name: 'Fone 3/9' });
    expect(res.status).toBe(400);
    expect(await prisma.entry.count()).toBe(7);
  });

  test('série mensal: following em data e valor muda a cadência e as entradas futuras materializadas', async () => {
    const created = await createOk({ name: 'Spotify', amountCents: 2190, dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    const feb = created.find((e) => e.dueDate === '2027-02-05')!;

    const changed = await patchOk(feb.id, { scope: 'following', dueDate: '2027-02-10', amountCents: 2390 });
    expect(changed).toHaveLength(11); // fev/2027..dez/2027
    expect(changed.every((e) => e.dueDate.endsWith('-10') && e.amountCents === 2390)).toBe(true);

    await list('kind=EXPENSE&from=2028-06&to=2028-06');
    const rows = await seriesRows(seriesId);
    // dez/2026..jun/2028 = 19 meses, um por mês, sem duplicar.
    expect(rows).toHaveLength(19);
    const months = rows.map((r) => r.dueDate.slice(0, 7));
    expect(new Set(months).size).toBe(19);
    expect(rows.at(-1)).toMatchObject({ dueDate: '2028-06-10', amountCents: 2390 });
    expect(rows.slice(0, 2).map((r) => [r.dueDate, r.amountCents])).toEqual([
      ['2026-12-05', 2190],
      ['2027-01-05', 2190],
    ]);
  });

  test('entrada avulsa ignora scope e devolve a entrada alterada', async () => {
    const [entry] = await createOk({ name: 'Conta', dueDate: '2026-12-05' });
    const changed = await patchOk(entry!.id, { scope: 'following', name: 'Conta de luz', amountCents: 5000 });
    expect(changed).toEqual([expect.objectContaining({ id: entry!.id, name: 'Conta de luz', amountCents: 5000 })]);
    const viaNoScope = await patchOk(entry!.id, { dueDate: '2026-12-10', pixKey: '', note: 'n' });
    expect(viaNoScope[0]).toMatchObject({ dueDate: '2026-12-10', pixKey: null, note: 'n' });
  });

  test.each([
    ['body vazio', {}],
    ['scope series', { scope: 'series', amountCents: 1 }],
    ['amountCents zero', { amountCents: 0 }],
    ['dueDate inexistente', { dueDate: '2026-02-30' }],
    ['dueDate antes de 2000', { dueDate: '1999-12-31' }],
    ['dueDate depois de 2100', { dueDate: '2101-01-01' }],
    ['nome vazio', { name: '  ' }],
    ['paymentMethodId inexistente', { paymentMethodId: 'nao-existe' }],
  ])('validação: %s → 400', async (_label, body) => {
    const [entry] = await createOk({ name: 'Conta', dueDate: '2026-12-05' });
    const res = await patch(entry!.id, body);
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: expect.any(String) });
    const row = await prisma.entry.findUniqueOrThrow({ where: { id: entry!.id } });
    expect(row).toMatchObject({ name: 'Conta', amountCents: 1000 });
  });

  test('id inexistente ou de outro usuário → 404', async () => {
    const other = await createOtherUser();
    expect((await patch('nao-existe', { note: 'x' })).status).toBe(404);
    expect((await patch(other.entryId, { note: 'x' })).status).toBe(404);
    const row = await prisma.entry.findUniqueOrThrow({ where: { id: other.entryId } });
    expect(row.note).toBe('');
  });
});

describe('POST /api/entries: faixa de dueDate', () => {
  test.each(['1999-12-31', '2101-01-01', '0001-01-01', '9999-12-31'])('dueDate %s → 400', async (dueDate) => {
    const res = await create({ name: 'Conta', dueDate });
    expect(res.status).toBe(400);
    expect(await prisma.entry.count()).toBe(0);
  });

  test.each(['2000-01-01', '2100-12-31'])('dueDate %s → 201', async (dueDate) => {
    expect((await create({ name: 'Conta', dueDate })).status).toBe(201);
  });
});

describe('DELETE /api/entries/:id', () => {
  test('delete following na 5/7 remove 5..7 não pagas; delete series mantém as pagas', async () => {
    const { entries, seriesId } = await seedFone([1, 6]);

    const res = await del(bySeq(entries, 5).id, 'following');
    expect(res.status).toBe(204);
    expect((await seriesRows(seriesId)).map((r) => r.sequence)).toEqual([1, 2, 3, 4, 6]);

    expect((await del(bySeq(entries, 3).id, 'series')).status).toBe(204);
    expect((await seriesRows(seriesId)).map((r) => [r.sequence, r.paidOn])).toEqual([
      [1, '2026-11-18'],
      [6, '2026-11-18'],
    ]);
    expect(await prisma.series.count({ where: { id: seriesId } })).toBe(1);
  });

  test('delete following em entrada paga não apaga a própria entrada (R3)', async () => {
    const { entries, seriesId } = await seedFone([5]);
    expect((await del(bySeq(entries, 5).id, 'following')).status).toBe(204);
    expect((await seriesRows(seriesId)).map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  test('R3: entrada paga pode ser apagada sozinha com scope this', async () => {
    const { entries, seriesId } = await seedFone([2]);
    expect((await del(bySeq(entries, 2).id, 'this')).status).toBe(204);
    expect((await seriesRows(seriesId)).map((r) => r.sequence)).toEqual([1, 3, 4, 5, 6, 7]);
  });

  test('série sem entradas restantes é apagada', async () => {
    const { entries, seriesId } = await seedFone();
    expect((await del(bySeq(entries, 4).id, 'series')).status).toBe(204);
    expect(await prisma.entry.count()).toBe(0);
    expect(await prisma.series.count({ where: { id: seriesId } })).toBe(0);
  });

  test('série mensal: delete following encerra a série (não volta com o tempo)', async () => {
    const created = await createOk({ name: 'Academia', dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    const mar = created.find((e) => e.dueDate === '2027-03-05')!;
    expect((await del(mar.id, 'following')).status).toBe(204);
    expect((await seriesRows(seriesId)).map((r) => r.dueDate)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);

    await jumpTo(new Date('2028-06-18T15:00:00Z'));
    await list('kind=EXPENSE&from=2029-01&to=2029-01');
    expect(await prisma.entry.count({ where: { seriesId } })).toBe(3);
  });

  test('apagar a última entrada mensal com this: um GET depois não a recria', async () => {
    const created = await createOk({ name: 'Internet', dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    const last = created.at(-1)!;
    expect(last.dueDate).toBe('2027-12-05');

    expect((await del(last.id, 'this')).status).toBe(204);
    await list('kind=EXPENSE&from=2026-11&to=2027-12');
    await list('kind=EXPENSE&status=pending');
    const rows = await seriesRows(seriesId);
    expect(rows).toHaveLength(12);
    expect(rows.some((r) => r.dueDate === '2027-12-05')).toBe(false);
  });

  test('apagar todas as entradas mensais uma a uma não recria nada e apaga a série', async () => {
    const created = await createOk({ name: 'Streaming', dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    // Da mais recente para a mais antiga (apagar a primeira desloca o início da série).
    for (const e of [...created].reverse()) {
      expect((await del(e.id, 'this')).status).toBe(204);
      await list('kind=EXPENSE&status=pending');
    }
    expect(await prisma.entry.count()).toBe(0);
    expect(await prisma.series.count({ where: { id: seriesId } })).toBe(0);
  });

  test('série de entrada sem scope → 400; avulsa sem scope → 204', async () => {
    const { entries } = await seedFone();
    const res = await del(bySeq(entries, 3).id);
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'scope_required' });
    expect((await del(bySeq(entries, 3).id, 'everything')).status).toBe(400);
    expect(await prisma.entry.count()).toBe(7);

    const [single] = await createOk({ name: 'Conta', dueDate: '2026-12-05' });
    expect((await del(single!.id)).status).toBe(204);
    expect(await prisma.entry.count({ where: { id: single!.id } })).toBe(0);
  });

  test('id inexistente ou de outro usuário → 404', async () => {
    const other = await createOtherUser();
    expect((await del('nao-existe', 'this')).status).toBe(404);
    expect((await del(other.entryId, 'this')).status).toBe(404);
    expect(await prisma.entry.count({ where: { id: other.entryId } })).toBe(1);
  });
});

describe('POST /api/series/:id/end', () => {
  test('end da série mensal em 2027-02 apaga pendentes de mar/2027 em diante e ensureMaterialized não as recria', async () => {
    const created = await createOk({ name: 'Streaming', dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    // Uma futura paga fica no histórico.
    const apr = created.find((e) => e.dueDate === '2027-04-05')!;
    await pay(apr.id);

    const res = await endSeries(seriesId, { lastMonth: '2027-02' });
    expect(res.status).toBe(204);

    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.endedOn?.toISOString().slice(0, 10)).toBe('2027-02-28');
    const expected = ['2026-12-05', '2027-01-05', '2027-02-05', '2027-04-05'];
    expect((await seriesRows(seriesId)).map((r) => r.dueDate)).toEqual(expected);

    await list('kind=EXPENSE&from=2029-01&to=2029-01');
    await api('/api/default-month?kind=EXPENSE', undefined, cookie);
    await jumpTo(new Date('2028-06-18T15:00:00Z'));
    await list('kind=EXPENSE&status=pending');
    expect((await seriesRows(seriesId)).map((r) => r.dueDate)).toEqual(expected);
  });

  test('série parcelada → 400; de outro usuário ou inexistente → 404; body inválido → 400', async () => {
    const { seriesId } = await seedFone();
    expect((await endSeries(seriesId, { lastMonth: '2027-02' })).status).toBe(400);
    expect(await prisma.entry.count({ where: { seriesId } })).toBe(7);

    const other = await createOtherUser();
    expect((await endSeries(other.seriesId, { lastMonth: '2027-02' })).status).toBe(404);
    expect((await endSeries('nao-existe', { lastMonth: '2027-02' })).status).toBe(404);
    const otherSeries = await prisma.series.findUniqueOrThrow({ where: { id: other.seriesId } });
    expect(otherSeries.endedOn).toBeNull();

    const created = await createOk({ name: 'Mensal', dueDate: '2026-12-05', monthly: true });
    for (const body of [{}, { lastMonth: '2027-13' }, { lastMonth: '1999-12' }]) {
      expect((await endSeries(created[0]!.seriesId!, body)).status).toBe(400);
    }
  });
});

describe('materialização (carregado da Task 7)', () => {
  test('série mensal ativa sem nenhuma entrada não é recriada a partir de generatedThrough', async () => {
    const created = await createOk({ name: 'Internet', dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    await prisma.entry.deleteMany({ where: { seriesId } });
    await list('kind=EXPENSE&from=2026-11&to=2027-12');
    await list('kind=EXPENSE&status=pending');
    expect(await prisma.entry.count({ where: { seriesId } })).toBe(0);
  });

  test('overdue materializa até o mês atual antes de listar', async () => {
    await createOk({ name: 'Aluguel', dueDate: '2026-11-05', monthly: true });
    // Gerado até nov/2027. Um ano e meio depois, sem nenhum GET intermediário:
    await jumpTo(new Date('2028-03-18T15:00:00Z'));
    const overdue = await json<EntryDTO[]>(api('/api/entries/overdue?kind=EXPENSE', undefined, cookie));
    expect(overdue.slice(-4).map((e) => e.dueDate)).toEqual([
      '2027-12-05',
      '2028-01-05',
      '2028-02-05',
      '2028-03-05',
    ]);
    // nov/2026..mar/2028 = 17.
    expect(overdue).toHaveLength(17);
  });

  test('dois GET /api/entries concorrentes: sem duplicatas e sem 500', async () => {
    const created = await createOk({ name: 'Academia', dueDate: '2026-11-20', monthly: true });
    const seriesId = created[0]!.seriesId!;
    await jumpTo(new Date('2028-11-18T15:00:00Z'));
    const [a, b] = await Promise.all([
      list('kind=EXPENSE&from=2029-06&to=2029-06'),
      list('kind=EXPENSE&from=2029-06&to=2029-06'),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    // nov/2026..nov/2029 (hoje+12) = 37.
    const rows = await seriesRows(seriesId);
    expect(rows).toHaveLength(37);
    expect(new Set(rows.map((r) => r.sequence)).size).toBe(37);
    expect(new Set(rows.map((r) => r.dueDate)).size).toBe(37);
  });
});

/** Cria uma 2ª conta direto no banco (o cadastro só aceita uma conta). */
async function createOtherUser() {
  const user = await prisma.user.create({
    data: { id: 'outro-usuario', name: 'Outra Pessoa', email: 'outra@example.com' },
  });
  const series = await prisma.series.create({
    data: {
      userId: user.id,
      kind: 'EXPENSE',
      type: 'MONTHLY',
      baseName: 'Mensal alheia',
      dayOfMonth: 5,
      amountCents: 999,
      generatedThrough: new Date('2026-11-05T00:00:00Z'),
    },
  });
  const entry = await prisma.entry.create({
    data: {
      userId: user.id,
      kind: 'EXPENSE',
      name: 'Alheia',
      amountCents: 999,
      dueDate: new Date('2026-11-10T00:00:00Z'),
    },
  });
  return { userId: user.id, entryId: entry.id, seriesId: series.id };
}
