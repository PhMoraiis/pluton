import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requireUser, type AppEnv } from '../middleware/require-user';
import { commitImport, planImport, type ImportInput } from '../services/import';
import { dueDateSchema, invalid, MAX_CENTS } from './entries';

/** Limite do body JSON do import (o CSV vai como string dentro dele). */
export const IMPORT_BODY_LIMIT = 2 * 1024 * 1024;

const overrideSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    amountCents: z.number().int().positive().max(MAX_CENTS),
    dueDate: dueDateSchema,
  })
  .partial();

const previewSchema = z.object({
  csv: z.string(),
  // Chaves JSON são strings: `{ "15": { dueDate } }` → rowId 15.
  overrides: z.record(z.string().regex(/^[1-9]\d*$/), overrideSchema).optional(),
  excludedRowIds: z.array(z.number().int().positive()).optional(),
});

const commitSchema = previewSchema.extend({ acceptedMonthlyKeys: z.array(z.string()) });

function toInput(body: z.infer<typeof previewSchema>): ImportInput {
  return {
    csv: body.csv,
    overrides: body.overrides
      ? Object.fromEntries(Object.entries(body.overrides).map(([rowId, o]) => [Number(rowId), o]))
      : undefined,
    excludedRowIds: body.excludedRowIds,
  };
}

const limit = bodyLimit({
  maxSize: IMPORT_BODY_LIMIT,
  onError: (c) => c.json({ error: 'payload_too_large' }, 413),
});

export const importRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .post('/preview', limit, zValidator('json', previewSchema, invalid('json')), async (c) => {
    return c.json(await planImport(c.get('userId'), toInput(c.req.valid('json'))));
  })
  .post('/commit', limit, zValidator('json', commitSchema, invalid('json')), async (c) => {
    const body = c.req.valid('json');
    const result = await commitImport(c.get('userId'), {
      ...toInput(body),
      acceptedMonthlyKeys: body.acceptedMonthlyKeys,
    });
    return c.json(result);
  });
