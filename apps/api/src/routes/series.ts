import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AppEnv } from '../middleware/require-user';
import { EntryInputError, endSeries } from '../services/entries';
import { listMonthlySeries, setSeriesTags } from '../services/series';
import { inputMonthKeySchema, invalid, notFound, tagIdsSchema } from './entries';

const endSchema = z.object({ lastMonth: inputMonthKeySchema });
const monthlyQuerySchema = z.object({ kind: z.enum(['EXPENSE', 'INCOME']) });
const tagsSchema = z.object({ tagIds: tagIdsSchema });

// `/monthly` vem antes de qualquer rota com `/:id`.
export const seriesRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/monthly', zValidator('query', monthlyQuerySchema, invalid('query')), async (c) => {
    return c.json(await listMonthlySeries(c.get('userId'), c.req.valid('query').kind));
  })
  .put('/:id/tags', zValidator('json', tagsSchema, invalid('json')), async (c) => {
    try {
      const result = await setSeriesTags(c.get('userId'), c.req.param('id'), c.req.valid('json').tagIds);
      if (result === 'not_found') return c.json(notFound, 404);
      if (result === 'not_monthly') return c.json({ error: 'not_monthly' }, 400);
      return c.json(result);
    } catch (err) {
      if (err instanceof EntryInputError) return c.json({ error: err.code }, 400);
      throw err;
    }
  })
  .post('/:id/end', zValidator('json', endSchema, invalid('json')), async (c) => {
    const result = await endSeries(c.get('userId'), c.req.param('id'), c.req.valid('json').lastMonth);
    if (result === 'not_found') return c.json(notFound, 404);
    if (result === 'not_monthly') return c.json({ error: 'not_monthly' }, 400);
    return c.body(null, 204);
  });
