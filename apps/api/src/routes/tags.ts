import { zValidator } from '@hono/zod-validator';
import type { TagDTO } from '@pluton/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { requireUser, type AppEnv } from '../middleware/require-user';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const select = { id: true, name: true, color: true, sortOrder: true, system: true } as const;

const validateBody = zValidator('json', bodySchema, (result, c) => {
  if (!result.success) return c.json({ error: 'invalid_body' }, 400);
});

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const duplicate = { error: 'duplicate_name' } as const;
const notFound = { error: 'not_found' } as const;
const systemTag = { error: 'system_tag' } as const;

/**
 * O unique do banco diferencia maiúsculas; a regra de negócio, não. Comparação em JS
 * (ILIKE trataria `%` e `_` do nome como curinga).
 */
async function nameTaken(userId: string, name: string, excludeId?: string): Promise<boolean> {
  const wanted = name.toLocaleLowerCase('pt-BR');
  const tags = await prisma.tag.findMany({
    where: { userId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { name: true },
  });
  return tags.some((t) => t.name.toLocaleLowerCase('pt-BR') === wanted);
}

export const tagRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const tags: TagDTO[] = await prisma.tag.findMany({
      where: { userId: c.get('userId') },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select,
    });
    return c.json(tags);
  })
  .post('/', validateBody, async (c) => {
    const userId = c.get('userId');
    const { name, color } = c.req.valid('json');
    if (await nameTaken(userId, name)) return c.json(duplicate, 409);
    const last = await prisma.tag.aggregate({ where: { userId }, _max: { sortOrder: true } });
    try {
      const created: TagDTO = await prisma.tag.create({
        data: { userId, name, color, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        select,
      });
      return c.json(created, 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(duplicate, 409);
      throw err;
    }
  })
  .patch('/:id', validateBody, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const { name, color } = c.req.valid('json');
    const existing = await prisma.tag.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) return c.json(notFound, 404);
    if (await nameTaken(userId, name, id)) return c.json(duplicate, 409);
    try {
      const { count } = await prisma.tag.updateMany({ where: { id, userId }, data: { name, color } });
      if (count === 0) return c.json(notFound, 404);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(duplicate, 409);
      throw err;
    }
    const updated: TagDTO | null = await prisma.tag.findFirst({ where: { id, userId }, select });
    if (!updated) return c.json(notFound, 404);
    return c.json(updated);
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const tag = await prisma.tag.findFirst({
      where: { id, userId: c.get('userId') },
      select: { system: true },
    });
    if (!tag) return c.json(notFound, 404);
    if (tag.system !== null) return c.json(systemTag, 409);
    // EntryTag/SeriesTag caem em cascata (onDelete: Cascade).
    await prisma.tag.deleteMany({ where: { id, userId: c.get('userId'), system: null } });
    return c.body(null, 204);
  });
