import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';

/**
 * Pasta do build do PWA, servida só em produção (em dev o Vite serve o web).
 * `WEB_DIST_DIR` sobrescreve; o padrão é `apps/web/dist`, relativo a este
 * arquivo tanto em `apps/api/src` (tsx) quanto em `apps/api/dist` (bundle).
 */
export function resolveWebDist(env: Record<string, string | undefined>): string | undefined {
  if (env.NODE_ENV !== 'production') return undefined;
  return env.WEB_DIST_DIR ?? path.resolve(import.meta.dirname, '../../web/dist');
}

/**
 * Cabeçalhos de segurança de todas as respostas. CSP estrita: o build do Vite
 * não tem script nem estilo inline (o registro do service worker é feito pelo
 * bundle, `injectRegister: false`), e o app guarda dados financeiros no
 * localStorage para leitura offline — XSS precisa ficar bloqueado.
 */
export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
  xFrameOptions: 'DENY',
  referrerPolicy: 'same-origin',
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
});

function isApiPath(requestPath: string): boolean {
  return requestPath === '/api' || requestPath.startsWith('/api/');
}

/** Algo com extensão no último segmento (`/sw.js`, `/assets/x.css`) é arquivo, não rota do SPA. */
function looksLikeFile(requestPath: string): boolean {
  return /\.[^/]+$/.test(requestPath);
}

/**
 * Serve o build do PWA: arquivos estáticos e, para rotas do SPA fora de `/api`,
 * o `index.html` (fallback). Assets com hash (`/assets/*`) ganham cache longo;
 * o resto (index.html, sw.js, manifest, ícones) é revalidado a cada acesso,
 * para o service worker enxergar versões novas.
 */
export function serveWeb(app: Hono, root: string): void {
  app.use('*', async (c, next) => {
    await next();
    if (isApiPath(c.req.path) || !c.res.ok) return;
    // Cache longo só para arquivos com hash em /assets (nunca para o fallback do SPA).
    const hashedAsset = c.req.path.startsWith('/assets/') && looksLikeFile(c.req.path);
    c.header('Cache-Control', hashedAsset ? IMMUTABLE : NO_CACHE);
  });
  app.use('*', serveStatic({ root }));

  const index = serveStatic({ root, path: 'index.html' });
  app.get('*', (c, next) => {
    if (isApiPath(c.req.path) || looksLikeFile(c.req.path)) return next();
    return index(c, next);
  });
}
