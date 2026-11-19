import {
  addMonthsClamped,
  addMonthsToKey,
  dayOf,
  defaultMonth,
  monthKeyOf,
  monthRange,
  parseInstallmentName,
  planSequence,
  propagateFollowing,
  todayInSaoPaulo,
  type DeleteScope,
  type EditScope,
  type EntryDTO,
  type EntryKind,
  type IsoDate,
  type MonthKey,
} from '@pluton/shared';
import { prisma } from '../db';
import type { Prisma, Series } from '../generated/prisma/client';
import { entryInclude, fromIsoDate, sortEntryDTOs, toEntryDTO, toIsoDate } from './dto';
import { horizonMonth, materializeSeries } from './materialize';
import { assertTagsOwned, copySeriesTags, setEntryTags } from './tags';

/** Erro de regra de negócio que a rota devolve como `400 { error: code }`. */
export class EntryInputError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'EntryInputError';
  }
}

export interface CreateEntryInput {
  kind: EntryKind;
  name: string;
  amountCents: number;
  dueDate: IsoDate;
  paymentMethodId: string | null;
  pixKey: string | null;
  note: string;
  monthly: boolean;
}

export async function assertPaymentMethodOwned(userId: string, paymentMethodId: string | null): Promise<void> {
  if (paymentMethodId === null) return;
  const owned = await prisma.paymentMethod.count({ where: { id: paymentMethodId, userId } });
  if (owned === 0) throw new EntryInputError('invalid_payment_method');
}

/**
 * Cria o lançamento digitado:
 * - nome `Base x/y` → série `INSTALLMENT` com as entradas `x..y`;
 * - `monthly` → série `MONTHLY` materializada até o horizonte;
 * - senão, entrada avulsa.
 *
 * A observação (`note`) fica só na primeira entrada criada (a digitada).
 */
export async function createEntries(userId: string, input: CreateEntryInput): Promise<EntryDTO[]> {
  const installment = parseInstallmentName(input.name);
  if (installment && input.monthly) throw new EntryInputError('installment_cannot_be_monthly');
  await assertPaymentMethodOwned(userId, input.paymentMethodId);

  const common = {
    userId,
    kind: input.kind,
    amountCents: input.amountCents,
    paymentMethodId: input.paymentMethodId,
    pixKey: input.pixKey,
  };
  const dayOfMonth = dayOf(input.dueDate);

  const created = await prisma.$transaction(async (tx) => {
    if (installment) {
      const plan = planSequence(input.dueDate, installment.current, installment.total, dayOfMonth);
      const series = await tx.series.create({
        data: {
          ...common,
          type: 'INSTALLMENT',
          baseName: installment.baseName,
          totalInstallments: installment.total,
          dayOfMonth,
          generatedThrough: fromIsoDate(plan.at(-1)!.dueDate),
        },
      });
      await tx.entry.createMany({
        data: plan.map((p, i) => ({
          ...common,
          name: installment.baseName,
          dueDate: fromIsoDate(p.dueDate),
          note: i === 0 ? input.note : '',
          seriesId: series.id,
          sequence: p.sequence,
        })),
      });
      return seriesEntries(tx, series.id);
    }

    if (input.monthly) {
      const series = await tx.series.create({
        data: {
          ...common,
          type: 'MONTHLY',
          baseName: input.name,
          dayOfMonth,
          generatedThrough: fromIsoDate(input.dueDate),
        },
      });
      await tx.entry.create({
        data: {
          ...common,
          name: input.name,
          dueDate: fromIsoDate(input.dueDate),
          note: input.note,
          seriesId: series.id,
          sequence: 1,
        },
      });
      const todayMonth = monthKeyOf(todayInSaoPaulo());
      const startMonth = monthKeyOf(input.dueDate);
      await materializeSeries(tx, series.id, horizonMonth(startMonth, startMonth, todayMonth));
      return seriesEntries(tx, series.id);
    }

    const entry = await tx.entry.create({
      data: { ...common, name: input.name, dueDate: fromIsoDate(input.dueDate), note: input.note },
      include: entryInclude,
    });
    return [entry];
  });

  return sortEntryDTOs(created.map(toEntryDTO));
}

function seriesEntries(tx: Prisma.TransactionClient, seriesId: string) {
  return tx.entry.findMany({
    where: { seriesId },
    orderBy: { sequence: 'asc' },
    include: entryInclude,
  });
}

export type EntryStatus = 'pending' | 'paid' | 'all';

function statusFilter(status: EntryStatus): Prisma.EntryWhereInput {
  if (status === 'pending') return { paidOn: null };
  if (status === 'paid') return { paidOn: { not: null } };
  return {};
}

/**
 * Lançamentos do usuário por tipo, status e intervalo de meses (do vencimento).
 * Sem intervalo (só permitido para `pending`): todas as pendentes.
 */
export async function listEntries(
  userId: string,
  query: { kind: EntryKind; status: EntryStatus; range: { from: MonthKey; to: MonthKey } | null },
): Promise<EntryDTO[]> {
  const where: Prisma.EntryWhereInput = { userId, kind: query.kind, ...statusFilter(query.status) };
  if (query.range) {
    const { start, end } = monthRange(query.range.from, query.range.to);
    where.dueDate = { gte: fromIsoDate(start), lte: fromIsoDate(end) };
  }
  const rows = await prisma.entry.findMany({ where, orderBy: { dueDate: 'asc' }, include: entryInclude });
  return sortEntryDTOs(rows.map(toEntryDTO));
}

/** Pendentes com vencimento antes de hoje (São Paulo). */
export async function listOverdue(userId: string, kind: EntryKind): Promise<EntryDTO[]> {
  const rows = await prisma.entry.findMany({
    where: { userId, kind, paidOn: null, dueDate: { lt: fromIsoDate(todayInSaoPaulo()) } },
    orderBy: { dueDate: 'asc' },
    include: entryInclude,
  });
  return sortEntryDTOs(rows.map(toEntryDTO));
}

/** Mês da próxima pendente a vencer (hoje inclusive); sem nenhuma, o mês de hoje. */
export async function getDefaultMonth(userId: string, kind: EntryKind): Promise<MonthKey> {
  const today = todayInSaoPaulo();
  const next = await prisma.entry.findFirst({
    where: { userId, kind, paidOn: null, dueDate: { gte: fromIsoDate(today) } },
    orderBy: { dueDate: 'asc' },
    select: { dueDate: true },
  });
  return defaultMonth(next ? [toIsoDate(next.dueDate)] : [], today);
}

/**
 * Marca/desmarca como pago. `paid: true` só grava `paidOn = hoje` se ainda não estava
 * pago (update condicional: cliques repetidos ou concorrentes mantêm o primeiro `paidOn`).
 * Devolve `null` se a entrada não existe ou é de outro usuário.
 */
export async function setPaid(userId: string, id: string, paid: boolean): Promise<EntryDTO | null> {
  if (paid) {
    await prisma.entry.updateMany({
      where: { id, userId, paidOn: null },
      data: { paidOn: fromIsoDate(todayInSaoPaulo()) },
    });
  } else {
    await prisma.entry.updateMany({ where: { id, userId }, data: { paidOn: null } });
  }
  const entry = await prisma.entry.findFirst({ where: { id, userId }, include: entryInclude });
  return entry ? toEntryDTO(entry) : null;
}


// ---------------------------------------------------------------------------
// Edição, exclusão e encerramento de séries
// ---------------------------------------------------------------------------

export interface UpdateEntryInput {
  scope?: EditScope;
  name?: string;
  amountCents?: number;
  dueDate?: IsoDate;
  paymentMethodId?: string | null;
  pixKey?: string | null;
  note?: string;
  tagIds?: string[];
}

/** Campos da série alterados por uma edição `following`. */
type SeriesPatch = Partial<
  Pick<
    Series,
    'amountCents' | 'dayOfMonth' | 'generatedThrough' | 'baseName' | 'paymentMethodId' | 'pixKey' | 'totalInstallments'
  >
>;

/** Meses entre o mês de `from` e o mês de `to` (pode ser negativo). */
function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
}

/** Trava a linha da série (mesma trava da materialização) dentro de `tx`. */
export async function lockSeries(tx: Prisma.TransactionClient, seriesId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Series" WHERE id = ${seriesId} FOR UPDATE`;
}

/** Apaga a série se não sobrou nenhuma entrada. */
async function deleteSeriesIfEmpty(tx: Prisma.TransactionClient, seriesId: string): Promise<void> {
  const remaining = await tx.entry.count({ where: { seriesId } });
  if (remaining === 0) await tx.series.delete({ where: { id: seriesId } });
}

/**
 * Edita um lançamento. Devolve as entradas alteradas (ordem de exibição) ou `null`
 * se a entrada não existe / é de outro usuário.
 *
 * Em entrada de série, `scope` é obrigatório quando o body **muda** (difere do valor
 * atual da entrada) `dueDate`, `amountCents`, `name`, `paymentMethodId`, `pixKey` ou
 * `tagIds` (como conjunto); só os campos que mudam são aplicados/propagados. Em entrada
 * avulsa, `scope` é ignorado.
 *
 * - `this`: só a entrada (etiquetas inclusive, mesmo paga).
 * - `following`: `dueDate`/`amountCents` via `propagateFollowing` (pagas intocadas) e
 *   gravados na série; `name`/`paymentMethodId`/`pixKey`/`tagIds` na série, na entrada
 *   (mesmo paga) e nas seguintes não pagas.
 * - Nome de parcela: o sufixo `x/y` é removido (só o nome-base é gravado); `y` diferente
 *   do total (exige `following`) ajusta `totalInstallments`, gerando ou apagando parcelas
 *   não pagas. `x` é ignorado.
 * - `note` é sempre só da entrada.
 * - Série `SALARY`, valor mudado: `this` marca `amountAdjusted`; `following` desmarca a
 *   editada e não sobrescreve o valor das seguintes ajustadas (a data propaga).
 */
export async function updateEntry(
  userId: string,
  id: string,
  input: UpdateEntryInput,
): Promise<EntryDTO[] | null> {
  if (input.paymentMethodId !== undefined) await assertPaymentMethodOwned(userId, input.paymentMethodId);

  const rows = await prisma.$transaction(async (tx) => {
    const found = await tx.entry.findFirst({ where: { id, userId }, select: { seriesId: true } });
    if (!found) return null;
    if (found.seriesId) await lockSeries(tx, found.seriesId);
    const entry = await tx.entry.findFirst({
      where: { id, userId },
      include: { tags: { select: { tagId: true } } },
    });
    if (!entry) return null;
    if (input.tagIds !== undefined) await assertTagsOwned(tx, userId, input.tagIds);

    const series = entry.seriesId
      ? await tx.series.findUniqueOrThrow({ where: { id: entry.seriesId } })
      : null;

    // Nome: em parcela, grava só o nome-base e lê o total digitado.
    let name = input.name;
    let newTotal: number | null = null;
    if (name !== undefined && series?.type === 'INSTALLMENT') {
      const parsed = parseInstallmentName(name);
      if (parsed) {
        name = parsed.baseName;
        if (parsed.total !== series.totalInstallments) newTotal = parsed.total;
      }
    }

    // Só o que difere do valor atual da entrada conta como mudança.
    const currentDue = toIsoDate(entry.dueDate);
    const change = {
      name: name !== undefined && name !== entry.name ? name : undefined,
      amountCents:
        input.amountCents !== undefined && input.amountCents !== entry.amountCents
          ? input.amountCents
          : undefined,
      dueDate: input.dueDate !== undefined && input.dueDate !== currentDue ? input.dueDate : undefined,
      paymentMethodId:
        input.paymentMethodId !== undefined && input.paymentMethodId !== entry.paymentMethodId
          ? input.paymentMethodId
          : undefined,
      pixKey: input.pixKey !== undefined && input.pixKey !== entry.pixKey ? input.pixKey : undefined,
    };
    const note = input.note !== undefined && input.note !== entry.note ? input.note : undefined;
    const currentTags = new Set(entry.tags.map((t) => t.tagId));
    const tagIds =
      input.tagIds !== undefined &&
      (input.tagIds.length !== currentTags.size || input.tagIds.some((t) => !currentTags.has(t)))
        ? input.tagIds
        : undefined;
    const seriesFieldChanged =
      newTotal !== null || tagIds !== undefined || Object.values(change).some((v) => v !== undefined);
    /** Dados de update só desta entrada. */
    const ownData = {
      ...change,
      dueDate: change.dueDate !== undefined ? fromIsoDate(change.dueDate) : undefined,
      note,
    };

    if (!series || entry.sequence === null) {
      if (tagIds !== undefined) await setEntryTags(tx, [id], tagIds);
      const updated = await tx.entry.update({
        where: { id },
        data: ownData,
        include: entryInclude,
      });
      return [updated];
    }

    if (seriesFieldChanged && !input.scope) throw new EntryInputError('scope_required');
    if (newTotal !== null && input.scope !== 'following') {
      throw new EntryInputError('total_change_requires_following');
    }

    const changedIds = new Set<string>([id]);
    /**
     * Valor mudado numa série de salário: `this` marca a entrada como ajustada à mão;
     * `following` desmarca a editada e preserva o valor das seguintes ajustadas.
     */
    const salaryAmountChange = series.role === 'SALARY' && change.amountCents !== undefined;

    if (input.scope !== 'following') {
      if (tagIds !== undefined) await setEntryTags(tx, [id], tagIds);
      const data = salaryAmountChange ? { ...ownData, amountAdjusted: true } : ownData;
      const updated = await tx.entry.update({ where: { id }, data, include: entryInclude });
      return [updated];
    }

    // --- following ---
    if (note !== undefined) await tx.entry.update({ where: { id }, data: { note } });

    if (change.dueDate !== undefined || change.amountCents !== undefined) {
      const all = await tx.entry.findMany({ where: { seriesId: series.id } });
      const updates = propagateFollowing(
        all.map((e) => ({
          id: e.id,
          sequence: e.sequence!,
          dueDate: toIsoDate(e.dueDate),
          amountCents: e.amountCents,
          paidOn: e.paidOn ? toIsoDate(e.paidOn) : null,
        })),
        entry.sequence,
        { dueDate: change.dueDate, amountCents: change.amountCents },
      );
      // `amountAdjusted` só muda sob a trava da série, então a leitura acima vale na gravação.
      const adjusted = new Set(salaryAmountChange ? all.filter((e) => e.amountAdjusted).map((e) => e.id) : []);
      for (const u of updates) {
        const keepAmount = u.id !== id && adjusted.has(u.id);
        if (keepAmount && u.dueDate === undefined) continue;
        // `setPaid` não pega a trava da série: uma seguinte pode ter sido paga depois da
        // leitura acima. O filtro `paidOn: null` é reavaliado na gravação (após a trava de
        // linha), então uma parcela paga no meio do caminho fica intocada.
        const { count } = await tx.entry.updateMany({
          where: u.id === id ? { id } : { id: u.id, paidOn: null },
          data: {
            dueDate: u.dueDate !== undefined ? fromIsoDate(u.dueDate) : undefined,
            amountCents: keepAmount ? undefined : u.amountCents,
            ...(u.id === id && salaryAmountChange ? { amountAdjusted: false } : {}),
          },
        });
        if (count > 0) changedIds.add(u.id);
      }
    }

    const seriesData: SeriesPatch = {};
    if (change.amountCents !== undefined) seriesData.amountCents = change.amountCents;
    if (change.dueDate !== undefined) {
      const newDay = dayOf(change.dueDate);
      seriesData.dayOfMonth = newDay;
      // `generatedThrough` acompanha a nova cadência, na mesma posição relativa.
      if (series.generatedThrough) {
        const offset = monthsBetween(currentDue, toIsoDate(series.generatedThrough));
        if (offset >= 0) {
          seriesData.generatedThrough = fromIsoDate(addMonthsClamped(change.dueDate, offset, newDay));
        }
      }
    }
    if (change.name !== undefined) seriesData.baseName = change.name;
    if (change.paymentMethodId !== undefined) seriesData.paymentMethodId = change.paymentMethodId;
    if (change.pixKey !== undefined) seriesData.pixKey = change.pixKey;

    const attrs = { name: change.name, paymentMethodId: change.paymentMethodId, pixKey: change.pixKey };
    if (Object.values(attrs).some((v) => v !== undefined)) {
      const targets = await tx.entry.findMany({
        where: {
          seriesId: series.id,
          OR: [{ id }, { sequence: { gt: entry.sequence }, paidOn: null }],
        },
        select: { id: true },
      });
      const followers = targets.map((t) => t.id).filter((t) => t !== id);
      // Mesmo cuidado da propagação acima: `paidOn: null` reavaliado na gravação.
      await tx.entry.updateMany({
        where: { OR: [{ id }, { id: { in: followers }, paidOn: null }] },
        data: attrs,
      });
      for (const t of targets) changedIds.add(t.id);
    }

    // Antes do ajuste de total: parcelas novas herdam as etiquetas já gravadas na série.
    if (tagIds !== undefined) {
      await tx.seriesTag.deleteMany({ where: { seriesId: series.id } });
      await tx.seriesTag.createMany({ data: tagIds.map((tagId) => ({ seriesId: series.id, tagId })) });
      await setEntryTags(tx, [id], tagIds);
      const followers = await tx.entry.findMany({
        where: { seriesId: series.id, sequence: { gt: entry.sequence }, paidOn: null },
        select: { id: true },
      });
      const followerIds = followers.map((f) => f.id);
      await setEntryTags(tx, followerIds, tagIds, { onlyUnpaid: true });
      changedIds.add(id);
      for (const f of followerIds) changedIds.add(f);
    }

    if (newTotal !== null) {
      await changeTotalInstallments(tx, series.id, entry.sequence, newTotal, seriesData);
    }

    if (Object.keys(seriesData).length > 0) {
      await tx.series.update({ where: { id: series.id }, data: seriesData });
    }

    // Total novo muda o displayName ("x/y") de todas as entradas da série.
    if (newTotal !== null) return seriesEntries(tx, series.id);
    return tx.entry.findMany({ where: { id: { in: [...changedIds] } }, include: entryInclude });
  });

  return rows ? sortEntryDTOs(rows.map(toEntryDTO)) : null;
}

/**
 * Ajusta o total de uma série parcelada para `total` (já com as demais mudanças de
 * `following` aplicadas às entradas). Aumento: gera `max+1..total` mensalmente a partir
 * da última parcela. Diminuição: apaga as não pagas acima de `total`. Total abaixo da
 * maior parcela paga ou da parcela editada → 400. Grava em `seriesData`. Parcelas geradas
 * herdam as etiquetas da série.
 */
async function changeTotalInstallments(
  tx: Prisma.TransactionClient,
  seriesId: string,
  editedSequence: number,
  total: number,
  seriesData: SeriesPatch,
): Promise<void> {
  const { _max: paid } = await tx.entry.aggregate({
    where: { seriesId, paidOn: { not: null } },
    _max: { sequence: true },
  });
  if (total < (paid.sequence ?? 0)) throw new EntryInputError('total_below_paid_installment');
  if (total < editedSequence) throw new EntryInputError('total_below_edited_installment');

  seriesData.totalInstallments = total;
  await tx.entry.deleteMany({ where: { seriesId, sequence: { gt: total }, paidOn: null } });

  const last = await tx.entry.findFirst({ where: { seriesId }, orderBy: { sequence: 'desc' } });
  if (!last || last.sequence === null || last.sequence >= total) return;

  // Valores atuais da série, com as mudanças desta mesma edição por cima.
  const series = { ...(await tx.series.findUniqueOrThrow({ where: { id: seriesId } })), ...seriesData };
  const plan = planSequence(
    addMonthsClamped(toIsoDate(last.dueDate), 1, series.dayOfMonth),
    last.sequence + 1,
    total,
    series.dayOfMonth,
  );
  const created = await tx.entry.createManyAndReturn({
    data: plan.map((p) => ({
      userId: series.userId,
      kind: series.kind,
      name: series.baseName,
      amountCents: series.amountCents,
      dueDate: fromIsoDate(p.dueDate),
      paymentMethodId: series.paymentMethodId,
      pixKey: series.pixKey,
      seriesId,
      sequence: p.sequence,
    })),
    select: { id: true },
  });
  await copySeriesTags(tx, seriesId, created.map((e) => e.id));
  seriesData.generatedThrough = fromIsoDate(plan.at(-1)!.dueDate);
}

/**
 * Apaga lançamento(s). `scope` é obrigatório em entrada de série (ignorado em avulsa).
 * - `this`: só a entrada (mesmo paga).
 * - `following`: a entrada e as seguintes, **só as não pagas**; série mensal é encerrada
 *   no mês anterior ao da entrada, para não voltar a ser gerada.
 * - `series`: todas as não pagas da série; série mensal é encerrada.
 * Série sem entradas restantes é apagada. Devolve `false` se a entrada não existe.
 */
export async function deleteEntry(userId: string, id: string, scope: DeleteScope | undefined): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.entry.findFirst({ where: { id, userId }, select: { seriesId: true } });
    if (!found) return false;
    if (found.seriesId) await lockSeries(tx, found.seriesId);
    const entry = await tx.entry.findFirst({ where: { id, userId }, include: { series: true } });
    if (!entry) return false;

    const series = entry.series;
    if (!series || entry.sequence === null) {
      await tx.entry.delete({ where: { id } });
      return true;
    }
    if (!scope) throw new EntryInputError('scope_required');

    if (scope === 'this') {
      await tx.entry.delete({ where: { id } });
    } else {
      await tx.entry.deleteMany({
        where: {
          seriesId: series.id,
          paidOn: null,
          ...(scope === 'following' ? { sequence: { gte: entry.sequence } } : {}),
        },
      });
      if (series.type === 'MONTHLY') {
        const endedOn = await monthlyEndAfterDelete(tx, series.id, scope, toIsoDate(entry.dueDate));
        const current = series.endedOn ? toIsoDate(series.endedOn) : null;
        if (endedOn !== null && (current === null || endedOn < current)) {
          await tx.series.update({ where: { id: series.id }, data: { endedOn: fromIsoDate(endedOn) } });
        }
      }
    }
    await deleteSeriesIfEmpty(tx, series.id);
    return true;
  });
}

/** Fim de uma série mensal após delete `following`/`series` (`null` = série ficou vazia). */
async function monthlyEndAfterDelete(
  tx: Prisma.TransactionClient,
  seriesId: string,
  scope: 'following' | 'series',
  dueDate: IsoDate,
): Promise<IsoDate | null> {
  if (scope === 'following') {
    // Último dia do mês anterior ao da entrada.
    const previous = addMonthsToKey(monthKeyOf(dueDate), -1);
    return monthRange(previous, previous).end;
  }
  // `series`: só ficaram pagas; nada é gerado depois da última delas.
  const { _max } = await tx.entry.aggregate({ where: { seriesId }, _max: { dueDate: true } });
  return _max.dueDate ? toIsoDate(_max.dueDate) : null;
}

/**
 * Encerra uma série mensal: `endedOn` = último dia de `lastMonth` e apaga as entradas
 * não pagas posteriores (pagas ficam no histórico). Série sem entradas restantes é apagada.
 * `'not_found'` se a série não existe / é de outro usuário; `'not_monthly'` se parcelada.
 */
export async function endSeries(
  userId: string,
  seriesId: string,
  lastMonth: MonthKey,
): Promise<'ok' | 'not_found' | 'not_monthly'> {
  return prisma.$transaction((tx) => endSeriesIn(tx, userId, seriesId, lastMonth));
}

/** Corpo de `endSeries` numa transação já aberta (o salário o usa sob o seu advisory lock). */
export async function endSeriesIn(
  tx: Prisma.TransactionClient,
  userId: string,
  seriesId: string,
  lastMonth: MonthKey,
): Promise<'ok' | 'not_found' | 'not_monthly'> {
  const owned = await tx.series.count({ where: { id: seriesId, userId } });
  if (owned === 0) return 'not_found';
  await lockSeries(tx, seriesId);
  const series = await tx.series.findFirst({ where: { id: seriesId, userId } });
  if (!series) return 'not_found';
  if (series.type !== 'MONTHLY') return 'not_monthly';

  const endedOn = fromIsoDate(monthRange(lastMonth, lastMonth).end);
  await tx.series.update({ where: { id: seriesId }, data: { endedOn } });
  await tx.entry.deleteMany({ where: { seriesId, paidOn: null, dueDate: { gt: endedOn } } });
  await deleteSeriesIfEmpty(tx, seriesId);
  return 'ok';
}
