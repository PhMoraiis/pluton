import { createAuthClient } from 'better-auth/react';

/**
 * Cliente do Better Auth na mesma origem do app (`/api/auth/*`; em dev o Vite
 * faz proxy para a API). `useSession()` chama `GET /api/auth/get-session`, que
 * também renova o cookie de sessão — por isso o guard de rotas o usa ao abrir o
 * app e o Better Auth refaz a chamada quando a janela volta a ficar visível.
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  basePath: '/api/auth',
  sessionOptions: { refetchOnWindowFocus: true },
  // Resolve `fetch` a cada chamada (o padrão captura o global na criação), o que
  // permite substituí-lo nos testes.
  fetchOptions: { customFetchImpl: (input, init) => globalThis.fetch(input, init) },
});

/** Pede ao Better Auth para buscar a sessão de novo (ex.: depois de um 401 da API). */
export function refreshSession(): void {
  authClient.$store.notify('$sessionSignal');
}

const SIGNED_IN_KEY = 'pluton:signed-in';

/**
 * Marca local de "já houve sessão neste aparelho". Só serve para decidir, sem
 * conexão, se o app mostra os dados em cache (somente leitura) ou a tela de login.
 * Não é credencial: qualquer chamada à API continua exigindo o cookie de sessão.
 */
export function rememberSignedIn(): void {
  try {
    localStorage.setItem(SIGNED_IN_KEY, '1');
  } catch {
    // armazenamento indisponível: segue sem a marca
  }
}

export function forgetSignedIn(): void {
  try {
    localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // idem
  }
}

export function wasSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}
