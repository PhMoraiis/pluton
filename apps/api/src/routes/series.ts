import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AppEnv } from '../middleware/require-user';
import { endSeries } from '../services/entries';
import { inputMonthKeySchema, invalid, notFound } from './entries';

const endSchema = z.object({ lastMonth: inputMonthKeySchema });

export const seriesRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .post('/:id/end', zValidator('json', endSchema, invalid('json')), async (c) => {
    const result = await endSeries(c.get('userId'), c.req.param('id'), c.req.valid('json').lastMonth);
    if (result === 'not_found') return c.json(notFound, 404);
    if (result === 'not_monthly') return c.json({ error: 'not_monthly' }, 400);
    return c.body(null, 204);
  });
