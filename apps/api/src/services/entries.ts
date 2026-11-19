import {
  dayOf,
  defaultMonth,
  monthKeyOf,
  monthRange,
  parseInstallmentName,
  planSequence,
  todayInSaoPaulo,
  type EntryDTO,
  type EntryKind,
  type IsoDate,
  type MonthKey,
} from '@pluton/shared';
import { prisma } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { entryInclude, fromIsoDate, sortEntryDTOs, toEntryDTO, toIsoDate } from './dto';
import { horizonMonth, materializeSeries } from './materialize';

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

async function assertPaymentMethodOwned(userId: string, paymentMethodId: string | null): Promise<void> {
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

