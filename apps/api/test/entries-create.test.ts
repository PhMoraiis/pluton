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
    {
      method: 'POST',
      body: JSON.stringify({ kind: 'EXPENSE', amountCents: 1000, ...body }),
    },
    cookie,
  );
}

async function createOk(body: CreateBody): Promise<EntryDTO[]> {
  const res = await create(body);
  expect(res.status).toBe(201);
  return json<EntryDTO[]>(res);
}

function list(query: string) {
  return api(`/api/entries?${query}`, undefined, cookie);
}

function pay(id: string, paid: boolean) {
  return api(`/api/entries/${id}/pay`, { method: 'POST', body: JSON.stringify({ paid }) }, cookie);
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

async function seriesEntryCount(seriesId: string): Promise<number> {
  return prisma.entry.count({ where: { seriesId } });
}

describe('POST /api/entries', () => {
  test('"Fone 3/7" em 2026-12-05 cria série com 5 entradas (3..7), dez→abr, displayName "Fone 3/7"..."Fone 7/7"', async () => {
    const entries = await createOk({ name: 'Fone 3/7', amountCents: 15990, dueDate: '2026-12-05' });

    expect(entries.map((e) => [e.sequence, e.dueDate, e.displayName])).toEqual([
      [3, '2026-12-05', 'Fone 3/7'],
      [4, '2027-01-05', 'Fone 4/7'],
      [5, '2027-02-05', 'Fone 5/7'],
      [6, '2027-03-05', 'Fone 6/7'],
      [7, '2027-04-05', 'Fone 7/7'],
    ]);
    const seriesId = entries[0]!.seriesId!;
    expect(seriesId).toEqual(expect.any(String));
    for (const e of entries) {
      expect(e).toMatchObject({
        kind: 'EXPENSE',
        name: 'Fone',
        amountCents: 15990,
        seriesId,
        seriesType: 'INSTALLMENT',
        totalInstallments: 7,
        paidOn: null,
        note: '',
      });
    }
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series).toMatchObject({
      type: 'INSTALLMENT',
      baseName: 'Fone',
      totalInstallments: 7,
      dayOfMonth: 5,
      amountCents: 15990,
    });
    expect(await seriesEntryCount(seriesId)).toBe(5);
  });

  test('dia 31: "Celular 1/3" em 2027-01-31 → 2027-01-31, 2027-02-28, 2027-03-31', async () => {
    const entries = await createOk({ name: 'Celular 1/3', dueDate: '2027-01-31' });
    expect(entries.map((e) => e.dueDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  test('avulsa sem x/y e sem monthly → 1 entrada sem seriesId', async () => {
    const methods = await json<PaymentMethodDTO[]>(api('/api/payment-methods', undefined, cookie));
    const pix = methods.find((m) => m.name === 'Pix')!;
    const entries = await createOk({
      kind: 'INCOME',
      name: '  Salário  ',
      amountCents: 500000,
      dueDate: '2026-12-05',
      paymentMethodId: pix.id,
      pixKey: 'chave-ficticia@example.com',
      note: 'nota',
    });
    expect(entries).toEqual([
      {
        id: expect.any(String),
        kind: 'INCOME',
        name: 'Salário',
        displayName: 'Salário',
        amountCents: 500000,
        dueDate: '2026-12-05',
        paymentMethodId: pix.id,
        pixKey: 'chave-ficticia@example.com',
        note: 'nota',
        paidOn: null,
        seriesId: null,
        seriesType: null,
        sequence: null,
        totalInstallments: null,
      },
    ]);
    expect(await prisma.series.count()).toBe(0);
  });

  test('"Fone 1/7" com monthly:true → 400', async () => {
    const res = await create({ name: 'Fone 1/7', dueDate: '2026-12-05', monthly: true });
    expect(res.status).toBe(400);
    expect(await prisma.entry.count()).toBe(0);
    expect(await prisma.series.count()).toBe(0);
  });

  test.each([
    ['amountCents zero', { amountCents: 0 }],
    ['amountCents negativo', { amountCents: -100 }],
    ['amountCents fracionário', { amountCents: 10.5 }],
    ['amountCents como string', { amountCents: '1000' }],
    ['dueDate inexistente', { dueDate: '2026-02-30' }],
    ['dueDate mal formatada', { dueDate: '05/12/2026' }],
    ['nome vazio', { name: '   ' }],
    ['nome longo demais', { name: 'x'.repeat(121) }],
    ['pixKey longa demais', { pixKey: 'k'.repeat(141) }],
    ['kind inválido', { kind: 'OTHER' }],
    ['paymentMethodId inexistente', { paymentMethodId: 'nao-existe' }],
  ])('validação: %s → 400', async (_label, override) => {
    const res = await create({ name: 'Conta', dueDate: '2026-12-05', ...override });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: expect.any(String) });
    expect(await prisma.entry.count()).toBe(0);
  });

  test('paymentMethodId de outro usuário → 400', async () => {
    const other = await createOtherUser();
    const res = await create({ name: 'Conta', dueDate: '2026-12-05', paymentMethodId: other.methodId });
    expect(res.status).toBe(400);
    expect(await prisma.entry.count({ where: { userId: { not: other.userId } } })).toBe(0);
  });

  test('sem sessão → 401', async () => {
    const res = await api('/api/entries', {
      method: 'POST',
      body: JSON.stringify({ kind: 'EXPENSE', name: 'X', amountCents: 1, dueDate: '2026-12-05' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('materialização de séries mensais', () => {
  test('monthly "Spotify" em 2026-12-05 gera ao menos 13 meses; GET de 2029-01 materializa até lá sem duplicar', async () => {
    const created = await createOk({
      name: 'Spotify',
      amountCents: 2190,
      dueDate: '2026-12-05',
      monthly: true,
    });
    // Hoje 2026-11-18, série começa em dez/2026 → dez/2026..dez/2027 = 13 entradas.
    expect(created).toHaveLength(13);
    expect(created.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(created[0]!.dueDate).toBe('2026-12-05');
    expect(created[12]!.dueDate).toBe('2027-12-05');
    for (const e of created) {
      expect(e).toMatchObject({
        name: 'Spotify',
        displayName: 'Spotify',
        seriesType: 'MONTHLY',
        totalInstallments: null,
        amountCents: 2190,
      });
    }
    const seriesId = created[0]!.seriesId!;

    const res = await list('kind=EXPENSE&from=2029-01&to=2029-01');
    expect(res.status).toBe(200);
    const jan2029 = await json<EntryDTO[]>(res);
    expect(jan2029.map((e) => [e.dueDate, e.sequence])).toEqual([['2029-01-05', 26]]);
    // dez/2026..jan/2029 = 26 meses.
    expect(await seriesEntryCount(seriesId)).toBe(26);

    // Repetir não duplica.
    await list('kind=EXPENSE&from=2029-01&to=2029-01');
    await list('kind=EXPENSE&from=2026-11&to=2027-06');
    expect(await seriesEntryCount(seriesId)).toBe(26);
    const seqs = await prisma.entry.findMany({
      where: { seriesId },
      orderBy: { sequence: 'asc' },
      select: { sequence: true },
    });
    expect(seqs.map((s) => s.sequence)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    const series = await prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.generatedThrough?.toISOString().slice(0, 10)).toBe('2029-01-05');
  });

  test('horizonte avança com o tempo: um ano depois, GET de qualquer mês estende até hoje+12', async () => {
    const created = await createOk({ name: 'Academia', dueDate: '2026-11-20', monthly: true });
    // nov/2026..nov/2027 = 13.
    expect(created).toHaveLength(13);
    await jumpTo(new Date('2027-11-18T15:00:00Z'));
    await list('kind=EXPENSE&from=2027-11&to=2027-11');
    // nov/2026..nov/2028 = 25.
    expect(await seriesEntryCount(created[0]!.seriesId!)).toBe(25);
  });

  test('GET muito no futuro materializa no máximo 10 anos à frente de hoje', async () => {
    const created = await createOk({ name: 'Seguro', dueDate: '2026-11-25', monthly: true });
    await list('kind=EXPENSE&from=9999-12&to=9999-12');
    // nov/2026..nov/2036 = 121.
    expect(await seriesEntryCount(created[0]!.seriesId!)).toBe(121);
  });

  test('dia 31 em série mensal → último dia do mês, sem perder o dia nos meses seguintes', async () => {
    const created = await createOk({ name: 'Aluguel', dueDate: '2027-01-31', monthly: true });
    expect(created.slice(0, 4).map((e) => e.dueDate)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  test('respeita endedOn: nada é gerado depois do fim da série', async () => {
    const created = await createOk({ name: 'Streaming', dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    await prisma.series.update({
      where: { id: seriesId },
      data: { endedOn: new Date('2027-02-28T00:00:00Z') },
    });
    await prisma.entry.deleteMany({
      where: { seriesId, dueDate: { gt: new Date('2027-02-28T00:00:00Z') } },
    });
    await list('kind=EXPENSE&from=2029-01&to=2029-01');
    expect(await seriesEntryCount(seriesId)).toBe(3); // dez, jan, fev
  });

  test('entradas apagadas de uma série mensal não são recriadas (generatedThrough)', async () => {
    const created = await createOk({ name: 'Internet', dueDate: '2026-12-05', monthly: true });
    const seriesId = created[0]!.seriesId!;
    await prisma.entry.delete({ where: { id: created[2]!.id } }); // fev/2027
    await list('kind=EXPENSE&from=2027-02&to=2027-02');
    expect(await seriesEntryCount(seriesId)).toBe(12);
  });
});

describe('fuso horário (Review Focus 1)', () => {
  test.each(['UTC', 'Pacific/Kiritimati', 'Asia/Tokyo', 'Pacific/Pago_Pago', 'America/Sao_Paulo'])(
    'com TZ=%s no processo, dueDate "2026-12-05" volta "2026-12-05"',
    async (tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        // Garante que o fuso do processo foi de fato trocado.
        if (tz === 'UTC') expect(new Date(2026, 11, 5).getTimezoneOffset()).toBe(0);
        if (tz === 'Pacific/Kiritimati') expect(new Date(2026, 11, 5).getTimezoneOffset()).toBe(-840);

        const [created] = await createOk({ name: 'Conta de luz', dueDate: '2026-12-05' });
        expect(created!.dueDate).toBe('2026-12-05');

        const fetched = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-12&to=2026-12'));
        expect(fetched.map((e) => e.dueDate)).toEqual(['2026-12-05']);

        const row = await prisma.entry.findUniqueOrThrow({ where: { id: created!.id } });
        expect(row.dueDate.toISOString()).toBe('2026-12-05T00:00:00.000Z');

        const paid = await json<EntryDTO>(pay(created!.id, true));
        expect(paid.paidOn).toBe('2026-11-18');
        expect(paid.dueDate).toBe('2026-12-05');
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );

  test('pagar às 22h30 de 30/nov em São Paulo grava paidOn 2026-11-30', async () => {
    const previous = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const [entry] = await createOk({ name: 'Conta', dueDate: '2026-11-30' });
      await jumpTo(new Date('2026-12-01T01:30:00Z'));
      const paid = await json<EntryDTO>(pay(entry!.id, true));
      expect(paid.paidOn).toBe('2026-11-30');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe('POST /api/entries/:id/pay', () => {
  test('pay duas vezes mantém o primeiro paidOn; paid:false zera', async () => {
    const [entry] = await createOk({ name: 'Conta', dueDate: '2026-11-25' });

    const first = await pay(entry!.id, true);
    expect(first.status).toBe(200);
    expect((await json<EntryDTO>(first)).paidOn).toBe('2026-11-18');

    vi.setSystemTime(new Date('2026-11-20T15:00:00Z'));
    const second = await json<EntryDTO>(pay(entry!.id, true));
    expect(second.paidOn).toBe('2026-11-18');

    // Clique duplo concorrente: os dois respondem com o mesmo paidOn.
    const [a, b] = await Promise.all([pay(entry!.id, true), pay(entry!.id, true)]);
    expect((await json<EntryDTO>(a)).paidOn).toBe('2026-11-18');
    expect((await json<EntryDTO>(b)).paidOn).toBe('2026-11-18');

    const unpaid = await pay(entry!.id, false);
    expect(unpaid.status).toBe(200);
    expect((await json<EntryDTO>(unpaid)).paidOn).toBeNull();
    const again = await json<EntryDTO>(pay(entry!.id, false));
    expect(again.paidOn).toBeNull();

    const repaid = await json<EntryDTO>(pay(entry!.id, true));
    expect(repaid.paidOn).toBe('2026-11-20');
  });

  test('body inválido → 400; id inexistente → 404', async () => {
    const [entry] = await createOk({ name: 'Conta', dueDate: '2026-11-25' });
    const bad = await api(
      `/api/entries/${entry!.id}/pay`,
      { method: 'POST', body: JSON.stringify({ paid: 'yes' }) },
      cookie,
    );
    expect(bad.status).toBe(400);
    expect((await pay('nao-existe', true)).status).toBe(404);
    expect((await pay('nao-existe', false)).status).toBe(404);
  });
});

describe('GET /api/entries, overdue e default-month', () => {
  async function seedNovember() {
    const [atrasada] = await createOk({ name: 'Atrasada', dueDate: '2026-11-10' });
    const [paga] = await createOk({ name: 'Paga', dueDate: '2026-11-15' });
    const [hoje] = await createOk({ name: 'Vence hoje', dueDate: '2026-11-18' });
    const [futura] = await createOk({ name: 'Futura', dueDate: '2026-11-25' });
    const [dezembro] = await createOk({ name: 'Dezembro', dueDate: '2026-12-05' });
    const [ganho] = await createOk({ kind: 'INCOME', name: 'Ganho atrasado', dueDate: '2026-11-01' });
    await pay(paga!.id, true);
    return { atrasada: atrasada!, paga: paga!, hoje: hoje!, futura: futura!, dezembro: dezembro!, ganho: ganho! };
  }

  test('status=pending exclui pagas; overdue traz só pendentes vencidas antes de hoje', async () => {
    const s = await seedNovember();

    const all = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-11&to=2026-11'));
    expect(all.map((e) => e.name)).toEqual(['Atrasada', 'Paga', 'Vence hoje', 'Futura']);

    const defaultStatus = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-11&to=2026-11&status=all'));
    expect(defaultStatus).toEqual(all);

    const pending = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-11&to=2026-11&status=pending'));
    expect(pending.map((e) => e.name)).toEqual(['Atrasada', 'Vence hoje', 'Futura']);

    const paid = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-11&to=2026-11&status=paid'));
    expect(paid.map((e) => e.id)).toEqual([s.paga.id]);

    const range = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-11&to=2026-12&status=pending'));
    expect(range.map((e) => e.name)).toEqual(['Atrasada', 'Vence hoje', 'Futura', 'Dezembro']);

    // Sem from/to e status=pending → todas as pendentes do tipo.
    const allPending = await json<EntryDTO[]>(list('kind=EXPENSE&status=pending'));
    expect(allPending.map((e) => e.name)).toEqual(['Atrasada', 'Vence hoje', 'Futura', 'Dezembro']);

    const overdueRes = await api('/api/entries/overdue?kind=EXPENSE', undefined, cookie);
    expect(overdueRes.status).toBe(200);
    expect((await json<EntryDTO[]>(overdueRes)).map((e) => e.id)).toEqual([s.atrasada.id]);

    const overdueIncome = await json<EntryDTO[]>(api('/api/entries/overdue?kind=INCOME', undefined, cookie));
    expect(overdueIncome.map((e) => e.id)).toEqual([s.ganho.id]);
  });

  test('ordena por dueDate e depois displayName', async () => {
    await createOk({ name: 'Zeta', dueDate: '2026-12-05' });
    await createOk({ name: 'Alfa', dueDate: '2026-12-10' });
    await createOk({ name: 'Beta', dueDate: '2026-12-05' });
    await createOk({ name: 'Notebook 2/2', dueDate: '2026-12-05' });
    await createOk({ name: 'Notebook 1/3', dueDate: '2026-12-05' });
    const res = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-12&to=2026-12'));
    expect(res.map((e) => e.displayName)).toEqual([
      'Beta',
      'Notebook 1/3',
      'Notebook 2/2',
      'Zeta',
      'Alfa',
    ]);
  });

  test.each([
    ['sem kind', 'from=2026-11&to=2026-11'],
    ['kind inválido', 'kind=X&from=2026-11&to=2026-11'],
    ['status=all sem from/to', 'kind=EXPENSE'],
    ['status=paid sem from/to', 'kind=EXPENSE&status=paid'],
    ['só from', 'kind=EXPENSE&from=2026-11'],
    ['MonthKey inválido', 'kind=EXPENSE&from=2026-13&to=2026-13'],
    ['from depois de to', 'kind=EXPENSE&from=2026-12&to=2026-11'],
    ['status inválido', 'kind=EXPENSE&from=2026-11&to=2026-11&status=late'],
  ])('GET /api/entries %s → 400', async (_label, query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
  });

  test('overdue e default-month sem kind → 400', async () => {
    expect((await api('/api/entries/overdue', undefined, cookie)).status).toBe(400);
    expect((await api('/api/default-month', undefined, cookie)).status).toBe(400);
  });

  test('default-month: pendentes em 2026-11-25 e 2026-12-05, hoje 2026-11-18 → "2026-11"', async () => {
    await createOk({ name: 'Atrasada', dueDate: '2026-10-10' });
    await createOk({ name: 'Novembro', dueDate: '2026-11-25' });
    await createOk({ name: 'Dezembro', dueDate: '2026-12-05' });
    const res = await api('/api/default-month?kind=EXPENSE', undefined, cookie);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ month: '2026-11' });
  });

  test('default-month ignora pagas e outro kind; sem pendentes futuras → mês de hoje', async () => {
    const [nov] = await createOk({ name: 'Novembro', dueDate: '2026-11-25' });
    await createOk({ name: 'Janeiro', dueDate: '2027-01-05' });
    await createOk({ kind: 'INCOME', name: 'Ganho', dueDate: '2026-12-01' });
    await pay(nov!.id, true);
    expect(await json(api('/api/default-month?kind=EXPENSE', undefined, cookie))).toEqual({
      month: '2027-01',
    });
    expect(await json(api('/api/default-month?kind=INCOME', undefined, cookie))).toEqual({
      month: '2026-12',
    });
    await prisma.entry.deleteMany();
    expect(await json(api('/api/default-month?kind=EXPENSE', undefined, cookie))).toEqual({
      month: '2026-11',
    });
  });
});

/** Cria uma 2ª conta direto no banco (o cadastro só aceita uma conta). */
async function createOtherUser() {
  const user = await prisma.user.create({
    data: { id: 'outro-usuario', name: 'Outra Pessoa', email: 'outra@example.com' },
  });
  const method = await prisma.paymentMethod.create({
    data: { userId: user.id, name: 'Pix', color: '#2B593F', sortOrder: 0 },
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
  return { userId: user.id, methodId: method.id, entryId: entry.id, seriesId: series.id };
}

describe('isolamento entre usuários', () => {
  test('entrada de outro usuário → 404', async () => {
    const other = await createOtherUser();
    await createOk({ name: 'Minha', dueDate: '2026-11-10' });

    expect((await pay(other.entryId, true)).status).toBe(404);
    expect((await pay(other.entryId, false)).status).toBe(404);
    const row = await prisma.entry.findUniqueOrThrow({ where: { id: other.entryId } });
    expect(row.paidOn).toBeNull();

    const listed = await json<EntryDTO[]>(list('kind=EXPENSE&from=2026-11&to=2026-11'));
    expect(listed.map((e) => e.name)).toEqual(['Minha']);
    const overdue = await json<EntryDTO[]>(api('/api/entries/overdue?kind=EXPENSE', undefined, cookie));
    expect(overdue.map((e) => e.name)).toEqual(['Minha']);

    // A materialização do meu usuário não mexe nas séries alheias.
    await list('kind=EXPENSE&from=2029-01&to=2029-01');
    expect(await seriesEntryCount(other.seriesId)).toBe(0);
  });
});
