import { createApp } from '../src/app';
import { prisma } from '../src/db';

const app = createApp();

// Credenciais fictícias, só para testes.
export const TEST_USER = {
  name: 'Usuária Teste',
  email: 'teste@example.com',
  password: 'senha-de-teste-123',
} as const;

/** Trunca todas as tabelas do app (exceto o histórico de migrações). */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/** Requisição contra o app em memória; `cookie` vira o header Cookie. */
export function api(path: string, init?: RequestInit, cookie?: string): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (cookie) headers.set('cookie', cookie);
  if (typeof init?.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return Promise.resolve(app.request(path, { ...init, headers }));
}

export async function json<T = unknown>(res: Response | Promise<Response>): Promise<T> {
  return (await (await res).json()) as T;
}

/** Cadastra o usuário de teste e devolve o header Cookie da sessão criada. */
export async function signUpAndGetCookie(): Promise<string> {
  const res = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify(TEST_USER),
  });
  if (!res.ok) throw new Error(`sign-up falhou: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookie) throw new Error('sign-up não devolveu cookie de sessão');
  return cookie;
}
