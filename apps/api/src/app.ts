import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { auth } from './auth';
import { defaultMonthRoutes, entryRoutes, notFound } from './routes/entries';
import { importRoutes } from './routes/import';
import { paymentMethodRoutes } from './routes/payment-methods';
import { seriesRoutes } from './routes/series';
import { setupRoutes } from './routes/setup';
import { summaryRoutes } from './routes/summary';
import { securityHeaders, serveWeb } from './web';

/** Limite de body da API (auth incluída); só `/api/import/*` tem o seu, maior (2 MB). */
export const API_BODY_LIMIT = 64 * 1024;

const apiBodyLimit = bodyLimit({
  maxSize: API_BODY_LIMIT,
  onError: (c) => c.json({ error: 'payload_too_large' }, 413),
});

export type AppOptions = {
  /** Pasta do build do PWA a servir (produção); sem ela, só a API. */
  webDist?: string;
};

/** App HTTP completo; a API fica sob `/api` e, com `webDist`, o PWA no resto. */
export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const api = new Hono();

  app.use(securityHeaders);

  api.use('*', (c, next) => (c.req.path.startsWith('/api/import/') ? next() : apiBodyLimit(c, next)));

  // Health check do Dokploy: sem autenticação e sem tocar no banco.
  api.get('/health', (c) => c.json({ ok: true }));
  api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));
  api.route('/', setupRoutes);
  api.route('/payment-methods', paymentMethodRoutes);
  api.route('/entries', entryRoutes);
  api.route('/series', seriesRoutes);
  api.route('/default-month', defaultMonthRoutes);
  api.route('/summary', summaryRoutes);
  api.route('/import', importRoutes);
  // Qualquer outra rota da API: 404 em JSON (nunca o index.html do SPA).
  api.all('*', (c) => c.json(notFound, 404));

  app.route('/api', api);
  if (options.webDist) serveWeb(app, options.webDist);
  return app;
}
