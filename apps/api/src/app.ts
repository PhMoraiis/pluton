import { Hono } from 'hono';
import { auth } from './auth';
import { paymentMethodRoutes } from './routes/payment-methods';
import { setupRoutes } from './routes/setup';

/** App HTTP completo; todas as rotas ficam sob `/api`. */
export function createApp(): Hono {
  const app = new Hono();
  const api = new Hono();

  api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));
  api.route('/', setupRoutes);
  api.route('/payment-methods', paymentMethodRoutes);

  app.route('/api', api);
  return app;
}
