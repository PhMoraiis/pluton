import {
  buildImportPlan,
  entryDedupeKey,
  formatEntryName,
  monthKeyOf,
  monthRange,
  parseNotionCsv,
  todayInSaoPaulo,
  type BuildImportPlanOptions,
  type ImportPlan,
  type PlannedEntry,
} from '@pluton/shared';
import { prisma } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { NOTION_COLORS } from '../payment-method-defaults';
import { fromIsoDate, toIsoDate } from './dto';
import { ensureMaterialized } from './materialize';

/** Limite de `int4` no Postgres: valores acima viram linha inválida ("sem valor"). */
const MAX_CENTS = 2_147_483_647;

/** Apelidos de métodos do Notion (chave normalizada) → nome do método no app. */
const METHOD_ALIASES: Record<string, string> = { 'cartão': 'Cartão de crédito' };

/** Cor de método criado pelo import (nome desconhecido). */
export const IMPORTED_METHOD_COLOR = NOTION_COLORS.gray;

export interface ImportInput {
  csv: string;
  overrides?: BuildImportPlanOptions['overrides'];
  excludedRowIds?: number[];
}

export interface CommitResult {
  created: number;
  duplicates: number;
  invalidSkipped: number;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** Chaves de deduplicação de todas as despesas do usuário (nome exibido com `x/y`). */
async function existingKeys(db: Prisma.TransactionClient, userId: string): Promise<Set<string>> {
  const rows = await db.entry.findMany({
    where: { userId, kind: 'EXPENSE' },
    select: {
      kind: true,
      name: true,
      sequence: true,
      amountCents: true,
      dueDate: true,
      series: { select: { totalInstallments: true } },
    },
  });
  return new Set(
    rows.map((r) =>
      entryDedupeKey(
        r.kind,
        formatEntryName(r.name, r.sequence, r.series?.totalInstallments ?? null),
        toIsoDate(r.dueDate),
        r.amountCents,
      ),
    ),
  );
}

/** Plano de importação calculado no servidor contra as entradas atuais do usuário. */
export async function planImport(
  userId: string,
  input: ImportInput,
  db: Prisma.TransactionClient = prisma,
): Promise<ImportPlan> {
  const rows = parseNotionCsv(input.csv).map((row) =>
    row.amountCents !== null && row.amountCents > MAX_CENTS ? { ...row, amountCents: null } : row,
  );
  return buildImportPlan(rows, {
    today: todayInSaoPaulo(),
    existingKeys: await existingKeys(db, userId),
    overrides: input.overrides,
    excludedRowIds: input.excludedRowIds,
  });
}

/**
 * Resolve nomes de método do CSV para ids do usuário: case-insensitive com trim,
 * `Cartão` → `Cartão de crédito`, nome desconhecido → método novo (cor padrão, fim da lista).
 */
async function methodResolver(tx: Prisma.TransactionClient, userId: string) {
  const methods = await tx.paymentMethod.findMany({ where: { userId } });
  const byName = new Map(methods.map((m) => [normalize(m.name), m.id]));
  let nextSortOrder = Math.max(-1, ...methods.map((m) => m.sortOrder)) + 1;

  return async (name: string | null): Promise<string | null> => {
    if (name === null || !name.trim()) return null;
    const key = normalize(name);
    const alias = METHOD_ALIASES[key];
    const known = byName.get(key) ?? (alias ? byName.get(normalize(alias)) : undefined);
    if (known) return known;
    const created = await tx.paymentMethod.create({
      data: { userId, name: name.trim(), color: IMPORTED_METHOD_COLOR, sortOrder: nextSortOrder++ },
    });
    byName.set(key, created.id);
    return created.id;
  };
}

/**
 * Recalcula o plano no servidor (não confia no cliente) e grava tudo numa transação:
 * - séries parceladas (completadas) com `sequence`;
 * - sugestões mensais aceitas → série `MONTHLY` (ativas materializadas depois do commit;
 *   inativas encerradas no último dia do mês da última ocorrência);
 * - sugestões não aceitas e avulsas → entradas sem série.
 * Cada linha importada mantém valor, método e nota próprios; `paid` → `paidOn = dueDate`.
 */
export async function commitImport(
  userId: string,
  input: ImportInput & { acceptedMonthlyKeys: string[] },
): Promise<CommitResult> {
  const accepted = new Set(input.acceptedMonthlyKeys);

  const { plan, created } = await prisma.$transaction(
    async (tx) => {
      // Um import por usuário de cada vez: dois commits simultâneos (clique duplo) não
      // podem calcular o plano contra o mesmo estado e duplicar lançamentos.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`import:${userId}`}))`;
      const plan = await planImport(userId, input, tx);
      const resolveMethod = await methodResolver(tx, userId);
      let count = 0;

      const entryRow = async (
        e: PlannedEntry,
        name: string,
        series: { id: string; sequence: number } | null,
      ): Promise<Prisma.EntryCreateManyInput> => ({
        userId,
        kind: 'EXPENSE',
        name,
        amountCents: e.amountCents,
        dueDate: fromIsoDate(e.dueDate),
        paymentMethodId: await resolveMethod(e.paymentMethod),
        note: e.note,
        paidOn: e.paid ? fromIsoDate(e.dueDate) : null,
        seriesId: series?.id ?? null,
        sequence: series?.sequence ?? null,
      });

      const insert = async (rows: Prisma.EntryCreateManyInput[]) => {
        if (rows.length === 0) return;
        count += (await tx.entry.createMany({ data: rows })).count;
      };

      for (const s of plan.installmentSeries) {
        const lastDue = s.entries.reduce((max, e) => (e.dueDate > max ? e.dueDate : max), s.entries[0]!.dueDate);
        const series = await tx.series.create({
          data: {
            userId,
            kind: 'EXPENSE',
            type: 'INSTALLMENT',
            baseName: s.baseName,
            totalInstallments: s.total,
            dayOfMonth: s.dayOfMonth,
            amountCents: s.amountCents,
            paymentMethodId: await resolveMethod(s.paymentMethod),
            generatedThrough: fromIsoDate(lastDue),
          },
        });
        const rows: Prisma.EntryCreateManyInput[] = [];
        for (const e of s.entries) {
          rows.push(await entryRow(e, s.baseName, { id: series.id, sequence: e.sequence! }));
        }
        await insert(rows);
      }

      const singles: PlannedEntry[] = [...plan.singles];
      for (const s of plan.monthlySuggestions) {
        if (!accepted.has(s.key)) {
          singles.push(...s.entries);
          continue;
        }
        // Entradas da sugestão já vêm em ordem de vencimento.
        const lastDue = s.entries.at(-1)!.dueDate;
        const lastMonth = monthKeyOf(lastDue);
        const series = await tx.series.create({
          data: {
            userId,
            kind: 'EXPENSE',
            type: 'MONTHLY',
            baseName: s.name,
            dayOfMonth: s.dayOfMonth,
            amountCents: s.amountCents,
            paymentMethodId: await resolveMethod(s.paymentMethod),
            generatedThrough: fromIsoDate(lastDue),
            endedOn: s.active ? null : fromIsoDate(monthRange(lastMonth, lastMonth).end),
          },
        });
        const rows: Prisma.EntryCreateManyInput[] = [];
        for (const [i, e] of s.entries.entries()) {
          rows.push(await entryRow(e, s.name, { id: series.id, sequence: i + 1 }));
        }
        await insert(rows);
      }

      const singleRows: Prisma.EntryCreateManyInput[] = [];
      for (const e of singles) singleRows.push(await entryRow(e, e.name, null));
      await insert(singleRows);

      return { plan, created: count };
    },
    { timeout: 30_000 },
  );

  // Séries mensais ativas recém-criadas ganham as ocorrências futuras.
  await ensureMaterialized(userId, monthKeyOf(todayInSaoPaulo()));

  return { created, duplicates: plan.duplicates, invalidSkipped: plan.invalid.length };
}
