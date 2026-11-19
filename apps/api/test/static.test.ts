import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authAdvancedOptions } from '../src/auth';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { resolveWebDist } from '../src/web';

const INDEX_HTML = '<!doctype html><html><body><div id="root">pluton-index</div></body></html>';

let dist: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  // `dist` de teste, no mesmo formato do build do Vite.
  dist = mkdtempSync(path.join(tmpdir(), 'pluton-dist-'));
  writeFileSync(path.join(dist, 'index.html'), INDEX_HTML);
  writeFileSync(path.join(dist, 'sw.js'), 'self.addEventListener("install", () => {});');
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("app");');
  app = createApp({ webDist: resolveWebDist({ NODE_ENV: 'production', WEB_DIST_DIR: dist }) });
});

afterAll(async () => {
  rmSync(dist, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('resolveWebDist', () => {
  test('só serve o web em produção', () => {
    expect(resolveWebDist({ NODE_ENV: 'test', WEB_DIST_DIR: '/x' })).toBeUndefined();
    expect(resolveWebDist({ NODE_ENV: 'development' })).toBeUndefined();
    expect(resolveWebDist({ NODE_ENV: 'production', WEB_DIST_DIR: '/x/dist' })).toBe('/x/dist');
  });

  test('em produção, sem WEB_DIST_DIR, usa apps/web/dist', () => {
    const resolved = resolveWebDist({ NODE_ENV: 'production' });
    expect(resolved).toBeDefined();
    expect(resolved!.endsWith(path.join('web', 'dist'))).toBe(true);
  });
});

describe('servindo o PWA em produção', () => {
  test('rota do SPA devolve o index.html', async () => {
    const res = await app.request('/historico');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('pluton-index');
  });

  test('raiz devolve o index.html', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('pluton-index');
  });

  test('asset com hash é servido com cache longo', async () => {
    const res = await app.request('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/javascript/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  test('service worker é servido sem cache', async () => {
    const res = await app.request('/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  test('arquivo inexistente dá 404, não o index.html', async () => {
    const res = await app.request('/assets/nao-existe.js');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('pluton-index');
  });

  test('GET /api/health → { ok: true } sem autenticação', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('rota inexistente da API → 404 JSON, não o index.html', async () => {
    const res = await app.request('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  test('cabeçalhos de segurança com CSP estrita', async () => {
    const res = await app.request('/historico');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('same-origin');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('sem dist (dev/teste)', () => {
  test('rota fora de /api dá 404 e /api/health responde', async () => {
    const devApp = createApp();
    expect((await devApp.request('/historico')).status).toBe(404);
    expect(await (await devApp.request('/api/health')).json()).toEqual({ ok: true });
  });
});

describe('Better Auth atrás do Traefik', () => {
  test('rate limit usa o IP do cliente vindo do proxy', () => {
    expect(authAdvancedOptions('production').ipAddress?.ipAddressHeaders).toEqual([
      'x-forwarded-for',
      'x-real-ip',
    ]);
  });

  test('cookies seguros só em produção', () => {
    expect(authAdvancedOptions('production').useSecureCookies).toBe(true);
    expect(authAdvancedOptions('development').useSecureCookies).toBe(false);
  });
});
