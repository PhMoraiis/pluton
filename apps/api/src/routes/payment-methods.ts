import { zValidator } from '@hono/zod-validator';
import type { PaymentMethodDTO } from '@pluton/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { requireUser, type AppEnv } from '../middleware/require-user';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  chargeNextMonth: z.boolean().optional(),
});

const select = { id: true, name: true, color: true, sortOrder: true, chargeNextMonth: true } as const;

const validateBody = zValidator('json', bodySchema, (result, c) => {
  if (!result.success) return c.json({ error: 'invalid_body' }, 400);
});

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const duplicate = { error: 'duplicate_name' } as const;
const notFound = { error: 'not_found' } as const;

export const paymentMethodRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const methods: PaymentMethodDTO[] = await prisma.paymentMethod.findMany({
      where: { userId: c.get('userId') },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select,
    });
    return c.json(methods);
  })
  .post('/', validateBody, async (c) => {
    const userId = c.get('userId');
    const { name, color, chargeNextMonth } = c.req.valid('json');
    const last = await prisma.paymentMethod.aggregate({ where: { userId }, _max: { sortOrder: true } });
    try {
      const created: PaymentMethodDTO = await prisma.paymentMethod.create({
        data: { userId, name, color, chargeNextMonth: chargeNextMonth ?? false, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        select,
      });
      return c.json(created, 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(duplicate, 409);
      throw err;
    }
  })
  .patch('/:id', validateBody, async (c) => {
    const { name, color, chargeNextMonth } = c.req.valid('json');
    try {
      const { count } = await prisma.paymentMethod.updateMany({
        where: { id: c.req.param('id'), userId: c.get('userId') },
        // Clientes antigos (PWA em cache) não enviam o campo: só altera quando vier no body.
        data: { name, color, ...(chargeNextMonth !== undefined && { chargeNextMonth }) },
      });
      if (count === 0) return c.json(notFound, 404);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json(duplicate, 409);
      throw err;
    }
    const updated: PaymentMethodDTO = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: c.req.param('id') },
      select,
    });
    return c.json(updated);
  })
  .delete('/:id', async (c) => {
    // Entries/séries que usam o método ficam com paymentMethodId = null (onDelete: SetNull).
    const { count } = await prisma.paymentMethod.deleteMany({
      where: { id: c.req.param('id'), userId: c.get('userId') },
    });
    if (count === 0) return c.json(notFound, 404);
    return c.body(null, 204);
  });
