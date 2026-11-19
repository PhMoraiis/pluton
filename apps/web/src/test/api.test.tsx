import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, UnauthorizedError, apiFetch } from '../lib/api';
import { router } from '../router';

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Sessão fictícia no formato do `GET /api/auth/get-session` do Better Auth. */
const fakeSession = {
  session: {
    id: 's1',
    userId: 'u1',
    token: 'fake-session-id',
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
  },
  user: {
    id: 'u1',
    name: 'Pessoa Teste',
    email: 'pessoa@example.test',
    emailVerified: false,
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
  },
};

function mockFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url, init));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(async () => {
  localStorage.clear();
  await act(() => router.navigate('/'));
});

afterEach(async () => {
  cleanup();
  // Deixa terminar requisições disparadas no fim do teste (ex.: o refetch da
  // sessão depois de um 401) antes de devolver o `fetch` real.
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  test('apiFetch com resposta 401 navega para /login e lança UnauthorizedError', async () => {
    const navigate = vi.spyOn(router, 'navigate');
    const fetchMock = mockFetch(() => json({ error: 'unauthorized' }, 401));

    await expect(apiFetch('/api/entries')).rejects.toBeInstanceOf(UnauthorizedError);

    expect(fetchMock).toHaveBeenCalledWith('/api/entries', expect.objectContaining({ credentials: 'include' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toBe('/login');
    expect(router.state.location.pathname).toBe('/login');
  });

  test('sessão expirada com o app aberto: 401 mostra a tela de login, não tela em branco', async () => {
    let sessionValid = true;
    mockFetch((url) => {
      if (url.includes('/api/auth/get-session')) return json(sessionValid ? fakeSession : null);
      if (url.endsWith('/api/setup-status')) return json({ hasUser: true });
      return json({ error: 'unauthorized' }, 401);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Despesas' })).toBeInTheDocument();

    // Dias depois: a sessão expirou no servidor e a próxima chamada à API devolve 401.
    sessionValid = false;
    await act(async () => {
      await expect(apiFetch('/api/entries')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  test('resposta OK devolve o JSON', async () => {
    mockFetch(() => json({ hasUser: false }));
    await expect(apiFetch<{ hasUser: boolean }>('/api/setup-status')).resolves.toEqual({ hasUser: false });
  });

  test('204 devolve undefined', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(apiFetch('/api/entries/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  test('outros erros lançam ApiError com status e mensagem, sem navegar', async () => {
    const navigate = vi.spyOn(router, 'navigate');
    mockFetch(() => json({ error: 'Lançamento não encontrado' }, 404));

    const error = await apiFetch('/api/entries/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe('Lançamento não encontrado');
    expect(navigate).not.toHaveBeenCalled();
  });

  test('corpo JSON é enviado com Content-Type', async () => {
    const fetchMock = mockFetch(() => json({ id: '1' }, 201));
    await apiFetch('/api/entries', { method: 'POST', body: JSON.stringify({ name: 'Luz' }) });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });
});
