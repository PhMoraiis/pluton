import { zValidator } from '@hono/zod-validator';
import { addMonthsToKey, monthKeyOf, todayInSaoPaulo } from '@pluton/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireUser, type AppEnv } from '../middleware/require-user';
import { isValidIsoDate } from '../services/dto';
import {
  createEntries,
  EntryInputError,
  getDefaultMonth,
  listEntries,
  listOverdue,
  setPaid,
} from '../services/entries';
import { ensureMaterialized, MONTHLY_HORIZON_MONTHS } from '../services/materialize';

/** Limite de `int4` no Postgres. */
const MAX_CENTS = 2_147_483_647;

const kindSchema = z.enum(['EXPENSE', 'INCOME']);
const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const createSchema = z.object({
  kind: kindSchema,
  name: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive().max(MAX_CENTS),
  dueDate: z.string().refine(isValidIsoDate),
  paymentMethodId: z.string().min(1).nullish(),
  pixKey: z.string().max(140).nullish(),
  note: z.string().max(2000).optional(),
  monthly: z.boolean().optional(),
});

const listSchema = z
  .object({
    kind: kindSchema,
    from: monthKeySchema.optional(),
    to: monthKeySchema.optional(),
    status: z.enum(['pending', 'paid', 'all']).default('all'),
  })
  .refine((q) => (q.from === undefined) === (q.to === undefined))
  .refine((q) => q.from !== undefined || q.status === 'pending')
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to);

const kindQuerySchema = z.object({ kind: kindSchema });
const paySchema = z.object({ paid: z.boolean() });

function invalid(target: 'json' | 'query') {
  const error = target === 'json' ? 'invalid_body' : 'invalid_query';
  return (result: { success: boolean }, c: Context) => {
    if (!result.success) return c.json({ error }, 400);
  };
}

const notFound = { error: 'not_found' } as const;

function currentMonth() {
  return monthKeyOf(todayInSaoPaulo());
}

export const entryRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .post('/', zValidator('json', createSchema, invalid('json')), async (c) => {
    const body = c.req.valid('json');
    try {
      const created = await createEntries(c.get('userId'), {
        kind: body.kind,
        name: body.name,
        amountCents: body.amountCents,
        dueDate: body.dueDate,
        paymentMethodId: body.paymentMethodId ?? null,
        pixKey: body.pixKey ? body.pixKey : null,
        note: body.note ?? '',
        monthly: body.monthly ?? false,
      });
      return c.json(created, 201);
    } catch (err) {
      if (err instanceof EntryInputError) return c.json({ error: err.code }, 400);
      throw err;
    }
  })
  .get('/', zValidator('query', listSchema, invalid('query')), async (c) => {
    const userId = c.get('userId');
    const { kind, from, to, status } = c.req.valid('query');
    const range = from && to ? { from, to } : null;
    // Sem intervalo (todas as pendentes): materializa até o horizonte padrão.
    await ensureMaterialized(userId, to ?? addMonthsToKey(currentMonth(), MONTHLY_HORIZON_MONTHS));
    return c.json(await listEntries(userId, { kind, status, range }));
  })
  .get('/overdue', zValidator('query', kindQuerySchema, invalid('query')), async (c) => {
    return c.json(await listOverdue(c.get('userId'), c.req.valid('query').kind));
  })
  .post('/:id/pay', zValidator('json', paySchema, invalid('json')), async (c) => {
    const entry = await setPaid(c.get('userId'), c.req.param('id'), c.req.valid('json').paid);
    if (!entry) return c.json(notFound, 404);
    return c.json(entry);
  });

export const defaultMonthRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', zValidator('query', kindQuerySchema, invalid('query')), async (c) => {
    const userId = c.get('userId');
    await ensureMaterialized(userId, currentMonth());
    return c.json({ month: await getDefaultMonth(userId, c.req.valid('query').kind) });
  });
