import { Hono } from 'hono';
import { prisma } from '../db';

export const setupRoutes = new Hono().get('/setup-status', async (c) => {
  const hasUser = (await prisma.user.count()) > 0;
  return c.json({ hasUser });
});
