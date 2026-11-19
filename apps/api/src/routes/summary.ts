import { zValidator } from '@hono/zod-validator';
import { monthRange, summarize, type Summary } from '@pluton/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../db';
import { requireUser, type AppEnv } from '../middleware/require-user';
import { fromIsoDate, toIsoDate } from '../services/dto';
import { ensureMaterialized } from '../services/materialize';
import { invalid, monthKeySchema } from './entries';

const querySchema = z
  .object({ from: monthKeySchema, to: monthKeySchema })
  .refine((q) => q.from <= q.to);

/**
 * `GET /api/summary?from&to` — totais de despesas e ganhos (ambos os tipos) com
 * vencimento no intervalo de meses, mais o realizado. Materializa as séries mensais
 * até `to` antes de somar.
 */
export const summaryRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', zValidator('query', querySchema, invalid('query')), async (c) => {
    const userId = c.get('userId');
    const { from, to } = c.req.valid('query');
    await ensureMaterialized(userId, to);
    const { start, end } = monthRange(from, to);
    const rows = await prisma.entry.findMany({
      where: { userId, dueDate: { gte: fromIsoDate(start), lte: fromIsoDate(end) } },
      select: { kind: true, amountCents: true, paidOn: true },
    });
    const summary: Summary = summarize(rows.map((r) => ({ ...r, paidOn: r.paidOn ? toIsoDate(r.paidOn) : null })));
    return c.json(summary);
  });
