import { createMiddleware } from 'hono/factory';
import { auth } from '../auth';

export type AppEnv = { Variables: { userId: string } };

/** Exige sessão válida; põe o id do usuário em `c.get('userId')`. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});
