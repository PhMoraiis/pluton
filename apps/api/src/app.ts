import { Hono } from 'hono';
import { auth } from './auth';
import { defaultMonthRoutes, entryRoutes } from './routes/entries';
import { importRoutes } from './routes/import';
import { paymentMethodRoutes } from './routes/payment-methods';
import { seriesRoutes } from './routes/series';
import { setupRoutes } from './routes/setup';
import { summaryRoutes } from './routes/summary';

/** App HTTP completo; todas as rotas ficam sob `/api`. */
export function createApp(): Hono {
  const app = new Hono();
  const api = new Hono();

  api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));
  api.route('/', setupRoutes);
  api.route('/payment-methods', paymentMethodRoutes);
  api.route('/entries', entryRoutes);
  api.route('/series', seriesRoutes);
  api.route('/default-month', defaultMonthRoutes);
  api.route('/summary', summaryRoutes);
  api.route('/import', importRoutes);

  app.route('/api', api);
  return app;
}
