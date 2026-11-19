import { monthKeyOf, monthRange, todayInSaoPaulo, type EntryKind, type MonthlySeriesDTO } from '@pluton/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../db';
import { fromIsoDate } from './dto';
import { lockSeries } from './entries';
import { ensureMaterialized } from './materialize';
import { assertTagsOwned, setEntryTags } from './tags';

type SeriesRow = Prisma.SeriesGetPayload<{
  include: { tags: { select: { tag: { select: { id: true; name: true; sortOrder: true } } } } };
}>;

const seriesInclude = {
  tags: { select: { tag: { select: { id: true, name: true, sortOrder: true } } } },
} as const;

function toDTO(series: SeriesRow, currentMonthCents: number | undefined): MonthlySeriesDTO {
  return {
    id: series.id,
    name: series.baseName,
    kind: series.kind,
    amountCents: series.amountCents,
    currentMonthCents: currentMonthCents ?? series.amountCents,
    paymentMethodId: series.paymentMethodId,
    tagIds: series.tags
      .map((t) => t.tag)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'))
      .map((t) => t.id),
  };
}

function currentMonthBounds() {
  const month = monthKeyOf(todayInSaoPaulo());
  const { start, end } = monthRange(month, month);
  return { month, start: fromIsoDate(start), end: fromIsoDate(end) };
}

/** Soma dos valores das entradas de cada série com vencimento no mês atual. */
async function currentMonthSums(seriesIds: string[], start: Date, end: Date): Promise<Map<string, number>> {
  const groups = await prisma.entry.groupBy({
    by: ['seriesId'],
    where: { seriesId: { in: seriesIds }, dueDate: { gte: start, lte: end } },
    _sum: { amountCents: true },
  });
  return new Map(groups.map((g) => [g.seriesId as string, g._sum.amountCents ?? 0]));
}

/** Séries mensais ativas (não encerradas) do usuário no `kind`, por nome (pt-BR). */
export async function listMonthlySeries(userId: string, kind: EntryKind): Promise<MonthlySeriesDTO[]> {
  const { month, start, end } = currentMonthBounds();
  await ensureMaterialized(userId, month);
  const rows = await prisma.series.findMany({
    where: { userId, kind, type: 'MONTHLY', endedOn: null },
    include: seriesInclude,
  });
  const sums = await currentMonthSums(
    rows.map((r) => r.id),
    start,
    end,
  );
  return rows
    .sort((a, b) => a.baseName.localeCompare(b.baseName, 'pt-BR') || a.id.localeCompare(b.id))
    .map((r) => toDTO(r, sums.get(r.id)));
}

/**
 * Substitui as etiquetas da série e das entradas não pagas com vencimento a partir do
 * 1º dia do mês atual. `'not_found'` / `'not_monthly'` nos casos de erro; etiqueta
 * inválida lança `EntryInputError('invalid_tag')`.
 */
export async function setSeriesTags(
  userId: string,
  seriesId: string,
  tagIds: string[],
): Promise<MonthlySeriesDTO | 'not_found' | 'not_monthly'> {
  const { start, end } = currentMonthBounds();
  return prisma.$transaction(async (tx) => {
    if ((await tx.series.count({ where: { id: seriesId, userId } })) === 0) return 'not_found';
    await lockSeries(tx, seriesId);
    const series = await tx.series.findFirst({ where: { id: seriesId, userId } });
    if (!series) return 'not_found';
    if (series.type !== 'MONTHLY') return 'not_monthly';
    await assertTagsOwned(tx, userId, tagIds);

    await tx.seriesTag.deleteMany({ where: { seriesId } });
    if (tagIds.length > 0) {
      await tx.seriesTag.createMany({ data: tagIds.map((tagId) => ({ seriesId, tagId })) });
    }
    const entries = await tx.entry.findMany({
      where: { seriesId, paidOn: null, dueDate: { gte: start } },
      select: { id: true },
    });
    await setEntryTags(
      tx,
      entries.map((e) => e.id),
      tagIds,
      { onlyUnpaid: true },
    );

    const fresh = await tx.series.findUniqueOrThrow({ where: { id: seriesId }, include: seriesInclude });
    const agg = await tx.entry.aggregate({
      where: { seriesId, dueDate: { gte: start, lte: end } },
      _sum: { amountCents: true },
      _count: true,
    });
    return toDTO(fresh, agg._count > 0 ? (agg._sum.amountCents ?? 0) : undefined);
  });
}
