import type { Prisma } from '../generated/prisma/client';
import { EntryInputError } from './entries';

/** Todas as etiquetas são do usuário; senão `EntryInputError('invalid_tag')`. */
export async function assertTagsOwned(
  tx: Prisma.TransactionClient,
  userId: string,
  tagIds: string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const owned = await tx.tag.count({ where: { userId, id: { in: tagIds } } });
  if (owned !== new Set(tagIds).size) throw new EntryInputError('invalid_tag');
}

/**
 * Substitui as etiquetas das entradas por `tagIds`.
 *
 * Com `onlyUnpaid`, só mexe nas entradas com `paidOn: null`. O filtro é reavaliado na
 * gravação: as linhas são travadas (`FOR UPDATE`) antes, então uma entrada paga por
 * `setPaid` (que não pega a trava da série) no meio do caminho fica intocada.
 */
export async function setEntryTags(
  tx: Prisma.TransactionClient,
  entryIds: string[],
  tagIds: string[],
  opts?: { onlyUnpaid?: boolean },
): Promise<void> {
  if (entryIds.length === 0) return;
  let targets = entryIds;
  if (opts?.onlyUnpaid) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Entry" WHERE id = ANY(${entryIds}) AND "paidOn" IS NULL FOR UPDATE`;
    targets = rows.map((r) => r.id);
    if (targets.length === 0) return;
  }
  await tx.entryTag.deleteMany({ where: { entryId: { in: targets } } });
  if (tagIds.length === 0) return;
  await tx.entryTag.createMany({
    data: targets.flatMap((entryId) => tagIds.map((tagId) => ({ entryId, tagId }))),
    skipDuplicates: true,
  });
}

/** Copia as etiquetas da série (`SeriesTag`) para entradas recém-criadas dela. */
export async function copySeriesTags(
  tx: Prisma.TransactionClient,
  seriesId: string,
  entryIds: string[],
): Promise<void> {
  if (entryIds.length === 0) return;
  const tags = await tx.seriesTag.findMany({ where: { seriesId }, select: { tagId: true } });
  if (tags.length === 0) return;
  await tx.entryTag.createMany({
    data: entryIds.flatMap((entryId) => tags.map(({ tagId }) => ({ entryId, tagId }))),
    skipDuplicates: true,
  });
}
