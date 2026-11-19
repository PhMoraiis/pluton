import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LoginPage } from '../pages/LoginPage';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** Resposta de rate limit exatamente como o Better Auth 1.7 devolve. */
const rateLimited = () =>
  json({ message: 'Too many requests. Please try again later.' }, 429, { 'X-Retry-After': '9' });

let hasUser: boolean;
/** Resposta de `POST /api/auth/sign-in|sign-up/email`. */
let authResponse: () => Response;

beforeEach(() => {
  hasUser = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      if (url.pathname === '/api/setup-status') return json({ hasUser });
      if (url.pathname === '/api/auth/sign-in/email' || url.pathname === '/api/auth/sign-up/email') return authResponse();
      return json({ error: 'not_found' }, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function signIn() {
  renderLogin();
  fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: 'pessoa@example.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-ficticia-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

async function signUp() {
  hasUser = false;
  renderLogin();
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Pessoa Teste' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'pessoa@example.test' } });
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'senha-ficticia-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
}

describe('LoginPage: erros do Better Auth em pt-BR', () => {
  test('entrar com rate limit (429) mostra mensagem em português', async () => {
    authResponse = rateLimited;
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Aguarde alguns segundos e tente de novo.');
  });

  test('entrar com senha errada (401 INVALID_EMAIL_OR_PASSWORD) mostra mensagem em português', async () => {
    authResponse = () => json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401);
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  test('erro desconhecido em inglês não vaza para a tela', async () => {
    authResponse = () => json({ code: 'SOMETHING_NEW', message: 'Something unexpected happened' }, 400);
    await signIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar.');
  });

  test('criar conta com rate limit (429) mostra mensagem em português', async () => {
    authResponse = rateLimited;
    await signUp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Aguarde alguns segundos e tente de novo.');
  });

  test('criar conta com senha curta (PASSWORD_TOO_SHORT) mostra mensagem em português', async () => {
    authResponse = () => json({ code: 'PASSWORD_TOO_SHORT', message: 'Password too short' }, 400);
    await signUp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha curta demais: use pelo menos 8 caracteres.');
  });

  test('cadastro recusado pela conta única (403) mantém a mensagem do servidor', async () => {
    authResponse = () => json({ code: 'FORBIDDEN', message: 'Cadastro desabilitado: já existe uma conta.' }, 403);
    await signUp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cadastro desabilitado: já existe uma conta.');
  });
});
