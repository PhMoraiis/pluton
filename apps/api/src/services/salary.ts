import { addMonthsClamped, monthKeyOf, todayInSaoPaulo, type MonthKey, type SalaryDTO } from '@pluton/shared';
import { prisma } from '../db';
import type { Prisma, Series } from '../generated/prisma/client';
import { fromIsoDate, toIsoDate } from './dto';
import { assertPaymentMethodOwned, endSeries, EntryInputError, lockSeries } from './entries';
import { horizonMonth, materializeSeries } from './materialize';

/** Nome da série de salário criada. */
export const SALARY_NAME = 'Salário';

export interface SalaryInput {
  amountCents: number;
  dayOfMonth: number;
  startMonth: MonthKey;
  paymentMethodId: string | null;
}

/** Salário ativo: série `SALARY` não encerrada (no máximo uma por usuário). */
function findActive(db: Prisma.TransactionClient, userId: string) {
  return db.series.findFirst({ where: { userId, role: 'SALARY', endedOn: null } });
}

/** `startMonth` = mês da entrada de menor `sequence`; sem entradas, o de `generatedThrough`. */
async function toSalaryDTO(db: Prisma.TransactionClient, series: Series): Promise<SalaryDTO> {
  const first = await db.entry.findFirst({
    where: { seriesId: series.id },
    orderBy: { sequence: 'asc' },
    select: { dueDate: true },
  });
  const anchor = first?.dueDate ?? series.generatedThrough;
  return {
    seriesId: series.id,
    amountCents: series.amountCents,
    dayOfMonth: series.dayOfMonth,
    paymentMethodId: series.paymentMethodId,
    startMonth: monthKeyOf(anchor ? toIsoDate(anchor) : todayInSaoPaulo()),
  };
}

export async function getSalary(userId: string): Promise<SalaryDTO | null> {
  const series = await findActive(prisma, userId);
  return series ? toSalaryDTO(prisma, series) : null;
}

/**
 * Configura o salário (uma transação, serializada por usuário com advisory lock):
 * - sem salário ativo, cria a série `SALARY` a partir de `startMonth` (mês atual ou
 *   futuro, sem sobrepor uma série de salário encerrada) e materializa até o horizonte;
 * - com salário ativo, ignora `startMonth` e grava valor, dia e método na série e nas
 *   entradas não pagas do mês atual em diante; o valor pula as ajustadas à mão.
 */
export async function putSalary(userId: string, input: SalaryInput): Promise<SalaryDTO> {
  await assertPaymentMethodOwned(userId, input.paymentMethodId);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`salary:${userId}`}))`;
    const todayMonth = monthKeyOf(todayInSaoPaulo());
    const active = await findActive(tx, userId);
    const series = active
      ? await updateSalary(tx, active.id, input, todayMonth)
      : await createSalary(tx, userId, input, todayMonth);
    return toSalaryDTO(tx, series);
  });
}

async function createSalary(
  tx: Prisma.TransactionClient,
  userId: string,
  input: SalaryInput,
  todayMonth: MonthKey,
): Promise<Series> {
  if (input.startMonth < todayMonth) throw new EntryInputError('start_month_in_past');
  const startDay = fromIsoDate(`${input.startMonth}-01`);
  // Série de salário encerrada que vai até o início pedido, ou que ainda guarda lançamento
  // (pago ou não) desse mês em diante (encerrada antes de um mês já recebido): contaria em dobro.
  const overlapping = await tx.series.count({
    where: {
      userId,
      role: 'SALARY',
      endedOn: { not: null },
      OR: [{ endedOn: { gte: startDay } }, { entries: { some: { dueDate: { gte: startDay } } } }],
    },
  });
  if (overlapping > 0) throw new EntryInputError('overlaps_previous_salary');

  const firstDue = fromIsoDate(addMonthsClamped(`${input.startMonth}-01`, 0, input.dayOfMonth));
  const common = {
    userId,
    kind: 'INCOME' as const,
    amountCents: input.amountCents,
    paymentMethodId: input.paymentMethodId,
  };
  const series = await tx.series.create({
    data: {
      ...common,
      type: 'MONTHLY',
      role: 'SALARY',
      baseName: SALARY_NAME,
      dayOfMonth: input.dayOfMonth,
      generatedThrough: firstDue,
    },
  });
  await tx.entry.create({
    data: { ...common, name: SALARY_NAME, dueDate: firstDue, seriesId: series.id, sequence: 1 },
  });
  await materializeSeries(tx, series.id, horizonMonth(input.startMonth, input.startMonth, todayMonth));
  return tx.series.findUniqueOrThrow({ where: { id: series.id } });
}

async function updateSalary(
  tx: Prisma.TransactionClient,
  seriesId: string,
  input: SalaryInput,
  todayMonth: MonthKey,
): Promise<Series> {
  await lockSeries(tx, seriesId);
  const current = await tx.series.findUniqueOrThrow({ where: { id: seriesId } });
  const series = await tx.series.update({
    where: { id: seriesId },
    data: {
      amountCents: input.amountCents,
      dayOfMonth: input.dayOfMonth,
      paymentMethodId: input.paymentMethodId,
      generatedThrough: current.generatedThrough
        ? fromIsoDate(addMonthsClamped(toIsoDate(current.generatedThrough), 0, input.dayOfMonth))
        : null,
    },
  });

  const targets = await tx.entry.findMany({
    where: { seriesId, paidOn: null, dueDate: { gte: fromIsoDate(`${todayMonth}-01`) } },
    select: { id: true, dueDate: true, amountAdjusted: true },
  });
  for (const e of targets) {
    const monthStart = `${monthKeyOf(toIsoDate(e.dueDate))}-01`;
    // `setPaid` não pega a trava da série: `paidOn: null` é reavaliado na gravação.
    await tx.entry.updateMany({
      where: { id: e.id, paidOn: null },
      data: {
        dueDate: fromIsoDate(addMonthsClamped(monthStart, 0, input.dayOfMonth)),
        paymentMethodId: input.paymentMethodId,
        amountCents: e.amountAdjusted ? undefined : input.amountCents,
      },
    });
  }
  return series;
}

/** Encerra o salário ativo em `lastMonth` (via `endSeries`); `false` sem salário ativo. */
export async function endSalary(userId: string, lastMonth: MonthKey): Promise<boolean> {
  const active = await findActive(prisma, userId);
  if (!active) return false;
  return (await endSeries(userId, active.id, lastMonth)) === 'ok';
}
