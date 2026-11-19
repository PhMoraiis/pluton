import {
  addMonthsClamped,
  addMonthsToKey,
  monthKeyOf,
  todayInSaoPaulo,
  type MonthKey,
} from '@pluton/shared';
import { prisma } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { fromIsoDate, toIsoDate } from './dto';
import { copySeriesTags } from './tags';

/** Meses gerados à frente de `max(mês de hoje, mês de início da série)`. */
export const MONTHLY_HORIZON_MONTHS = 12;

/** Teto de materialização sob demanda (evita gerar milhares de linhas para `to=9999-12`). */
export const MAX_MATERIALIZE_AHEAD_MONTHS = 120;

function maxKey(a: MonthKey, b: MonthKey): MonthKey {
  return a > b ? a : b;
}

/**
 * Último mês (inclusive) que uma série mensal deve ter materializado:
 * `max(throughMonth, max(mês de hoje, mês de início) + 12)`.
 */
export function horizonMonth(throughMonth: MonthKey, startMonth: MonthKey, todayMonth: MonthKey): MonthKey {
  return maxKey(throughMonth, addMonthsToKey(maxKey(todayMonth, startMonth), MONTHLY_HORIZON_MONTHS));
}

/**
 * Gera as entradas faltantes de uma série mensal até `horizon` (inclusive), dentro de `tx`.
 *
 * - Âncora: `generatedThrough` (último vencimento já gerado). Só meses posteriores a ele
 *   são gerados, então entradas apagadas de propósito nunca são recriadas.
 * - Trava a linha da série (`FOR UPDATE`) para que requisições concorrentes não gerem o
 *   mesmo mês duas vezes; `skipDuplicates` sobre `@@unique([seriesId, sequence])` é a
 *   segunda barreira.
 * - As entradas criadas herdam as etiquetas da série (`SeriesTag`).
 * - Respeita `endedOn`: nenhum vencimento depois dele; ao alcançá-lo, `generatedThrough`
 *   vira `endedOn` (geração completa).
 */
export async function materializeSeries(
  tx: Prisma.TransactionClient,
  seriesId: string,
  horizon: MonthKey,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Series" WHERE id = ${seriesId} FOR UPDATE`;
  const series = await tx.series.findUnique({ where: { id: seriesId } });
  if (!series || series.type !== 'MONTHLY' || !series.generatedThrough) return;

  const generatedThrough = toIsoDate(series.generatedThrough);
  const endedOn = series.endedOn ? toIsoDate(series.endedOn) : null;
  if (monthKeyOf(generatedThrough) >= horizon) return;
  if (endedOn !== null && generatedThrough >= endedOn) return;

  const { _max } = await tx.entry.aggregate({ where: { seriesId }, _max: { sequence: true } });
  const lastSequence = _max.sequence ?? 0;

  const rows: Prisma.EntryCreateManyInput[] = [];
  let reachedEnd = false;
  for (let i = 1; ; i++) {
    const dueDate = addMonthsClamped(generatedThrough, i, series.dayOfMonth);
    if (monthKeyOf(dueDate) > horizon) break;
    if (endedOn !== null && dueDate > endedOn) {
      reachedEnd = true;
      break;
    }
    rows.push({
      userId: series.userId,
      kind: series.kind,
      name: series.baseName,
      amountCents: series.amountCents,
      dueDate: fromIsoDate(dueDate),
      paymentMethodId: series.paymentMethodId,
      pixKey: series.pixKey,
      seriesId,
      sequence: lastSequence + i,
    });
  }
  // Série encerrada que já gerou tudo até `endedOn`: `generatedThrough = endedOn` marca a
  // geração como completa, e o atalho (`generatedThrough >= endedOn`) passa a pulá-la sem
  // abrir transação nem travar a linha. Só avança: nada apagado volta a ser gerado.
  const last = rows.at(-1);
  const through = reachedEnd ? fromIsoDate(endedOn!) : last?.dueDate;
  if (rows.length > 0) {
    const created = await tx.entry.createManyAndReturn({
      data: rows,
      skipDuplicates: true,
      select: { id: true },
    });
    await copySeriesTags(tx, seriesId, created.map((e) => e.id));
  }
  if (through) await tx.series.update({ where: { id: seriesId }, data: { generatedThrough: through } });
}

/**
 * Garante que toda série mensal ativa do usuário tenha entradas até
 * `max(throughMonth, max(mês de hoje, mês de início da série) + 12)`. Idempotente.
 * `throughMonth` é limitado a hoje + `MAX_MATERIALIZE_AHEAD_MONTHS`.
 */
export async function ensureMaterialized(userId: string, throughMonth: MonthKey): Promise<void> {
  const todayMonth = monthKeyOf(todayInSaoPaulo());
  const cap = addMonthsToKey(todayMonth, MAX_MATERIALIZE_AHEAD_MONTHS);
  const through = throughMonth > cap ? cap : throughMonth;
  const series = await prisma.series.findMany({
    where: { userId, type: 'MONTHLY', generatedThrough: { not: null } },
    select: { id: true, generatedThrough: true, endedOn: true },
  });
  const pending = series.filter(
    (s) => !(s.endedOn && s.generatedThrough && s.generatedThrough >= s.endedOn),
  );
  if (pending.length === 0) return;

  const starts = await prisma.entry.groupBy({
    by: ['seriesId'],
    where: { userId, seriesId: { in: pending.map((s) => s.id) } },
    _min: { dueDate: true },
  });
  const startBySeries = new Map(starts.map((s) => [s.seriesId, s._min.dueDate]));

  for (const s of pending) {
    // Série ativa sem nenhuma entrada (todas apagadas): o início vira o mês de hoje, não
    // `generatedThrough` — senão o horizonte saltaria 12 meses à frente do último gerado.
    const start = startBySeries.get(s.id);
    const startMonth = start ? monthKeyOf(toIsoDate(start)) : todayMonth;
    const horizon = horizonMonth(through, startMonth, todayMonth);
    if (monthKeyOf(toIsoDate(s.generatedThrough!)) >= horizon) continue;
    await prisma.$transaction((tx) => materializeSeries(tx, s.id, horizon));
  }
}
