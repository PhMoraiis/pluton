import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AppEnv } from '../middleware/require-user';
import { EntryInputError } from '../services/entries';
import { endSalary, getSalary, putSalary } from '../services/salary';
import { amountSchema, inputMonthKeySchema, invalid, notFound } from './entries';

const putSchema = z.object({
  amountCents: amountSchema,
  // 31 = último dia do mês (o clamp leva ao último dia).
  dayOfMonth: z.number().int().min(1).max(31),
  startMonth: inputMonthKeySchema,
  paymentMethodId: z.string().min(1).nullable(),
});

const endQuerySchema = z.object({ lastMonth: inputMonthKeySchema });

export const salaryRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await getSalary(c.get('userId'))))
  .put('/', zValidator('json', putSchema, invalid('json')), async (c) => {
    try {
      return c.json(await putSalary(c.get('userId'), c.req.valid('json')));
    } catch (err) {
      if (err instanceof EntryInputError) return c.json({ error: err.code }, 400);
      throw err;
    }
  })
  .delete('/', zValidator('query', endQuerySchema, invalid('query')), async (c) => {
    const ended = await endSalary(c.get('userId'), c.req.valid('query').lastMonth);
    if (!ended) return c.json(notFound, 404);
    return c.body(null, 204);
  });
