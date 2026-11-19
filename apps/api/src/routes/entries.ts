import { zValidator } from '@hono/zod-validator';
import { addMonthsToKey, monthKeyOf, todayInSaoPaulo } from '@pluton/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireUser, type AppEnv } from '../middleware/require-user';
import { isValidIsoDate } from '../services/dto';
import {
  createEntries,
  deleteEntry,
  EntryInputError,
  getDefaultMonth,
  listEntries,
  listOverdue,
  setPaid,
  updateEntry,
} from '../services/entries';
import { ensureMaterialized, MONTHLY_HORIZON_MONTHS } from '../services/materialize';

/** Limite de `int4` no Postgres. */
const MAX_CENTS = 2_147_483_647;

/** Faixa de anos aceita em datas digitadas (evita lixo como 0001 ou 9999). */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function yearInRange(value: string): boolean {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

const kindSchema = z.enum(['EXPENSE', 'INCOME']);
export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
/** `MonthKey` digitado (anos 2000..2100). */
export const inputMonthKeySchema = monthKeySchema.refine(yearInRange);
/** `IsoDate` de vencimento: existe no calendário e está em 2000..2100. */
const dueDateSchema = z.string().refine(isValidIsoDate).refine(yearInRange);
const nameSchema = z.string().trim().min(1).max(120);
const amountSchema = z.number().int().positive().max(MAX_CENTS);
const pixKeySchema = z.string().max(140).nullish();
const noteSchema = z.string().max(2000).optional();

const createSchema = z.object({
  kind: kindSchema,
  name: nameSchema,
  amountCents: amountSchema,
  dueDate: dueDateSchema,
  paymentMethodId: z.string().min(1).nullish(),
  pixKey: pixKeySchema,
  note: noteSchema,
  monthly: z.boolean().optional(),
});

const updateSchema = z
  .object({
    scope: z.enum(['this', 'following']).optional(),
    name: nameSchema.optional(),
    amountCents: amountSchema.optional(),
    dueDate: dueDateSchema.optional(),
    paymentMethodId: z.string().min(1).nullable().optional(),
    pixKey: pixKeySchema,
    note: noteSchema,
  })
  .refine((b) => Object.entries(b).some(([key, value]) => key !== 'scope' && value !== undefined));

const deleteQuerySchema = z.object({ scope: z.enum(['this', 'following', 'series']).optional() });

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

export function invalid(target: 'json' | 'query') {
  const error = target === 'json' ? 'invalid_body' : 'invalid_query';
  return (result: { success: boolean }, c: Context) => {
    if (!result.success) return c.json({ error }, 400);
  };
}

export const notFound = { error: 'not_found' } as const;

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
    const userId = c.get('userId');
    await ensureMaterialized(userId, currentMonth());
    return c.json(await listOverdue(userId, c.req.valid('query').kind));
  })
  .patch('/:id', zValidator('json', updateSchema, invalid('json')), async (c) => {
    const body = c.req.valid('json');
    try {
      const changed = await updateEntry(c.get('userId'), c.req.param('id'), {
        scope: body.scope,
        name: body.name,
        amountCents: body.amountCents,
        dueDate: body.dueDate,
        paymentMethodId: body.paymentMethodId,
        // String vazia limpa a chave (mesma regra da criação).
        pixKey: body.pixKey === undefined ? undefined : body.pixKey ? body.pixKey : null,
        note: body.note,
      });
      if (!changed) return c.json(notFound, 404);
      return c.json(changed);
    } catch (err) {
      if (err instanceof EntryInputError) return c.json({ error: err.code }, 400);
      throw err;
    }
  })
  .delete('/:id', zValidator('query', deleteQuerySchema, invalid('query')), async (c) => {
    try {
      const deleted = await deleteEntry(c.get('userId'), c.req.param('id'), c.req.valid('query').scope);
      if (!deleted) return c.json(notFound, 404);
      return c.body(null, 204);
    } catch (err) {
      if (err instanceof EntryInputError) return c.json({ error: err.code }, 400);
      throw err;
    }
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
