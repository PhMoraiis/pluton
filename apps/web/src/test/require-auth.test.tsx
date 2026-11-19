import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({
  value: { data: null as unknown, isPending: false, isRefetching: false, error: null as unknown },
}));

vi.mock('../lib/auth-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth-client')>();
  return { ...actual, authClient: { useSession: () => sessionState.value } };
});

import { RequireAuth } from '../components/RequireAuth';
import { rememberSignedIn } from '../lib/auth-client';

let online = true;

function renderGuarded() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <p>Conteúdo protegido</p>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<p>Tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RequireAuth offline', () => {
  const networkFailure = { data: null, isPending: false, isRefetching: false, error: new TypeError('Failed to fetch') };

  test('offline, sem resposta do get-session e com sessão anterior no aparelho: mostra o app (somente leitura)', () => {
    online = false;
    sessionState.value = networkFailure;
    rememberSignedIn();

    renderGuarded();

    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
    expect(screen.queryByText('Tela de login')).not.toBeInTheDocument();
  });

  test('offline sem sessão anterior no aparelho: vai para /login', () => {
    online = false;
    sessionState.value = networkFailure;

    renderGuarded();

    expect(screen.getByText('Tela de login')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  test('online e sem sessão (get-session devolveu null): vai para /login mesmo com a marca local', () => {
    sessionState.value = { data: null, isPending: false, isRefetching: false, error: null };
    rememberSignedIn();

    renderGuarded();

    expect(screen.getByText('Tela de login')).toBeInTheDocument();
  });
});
