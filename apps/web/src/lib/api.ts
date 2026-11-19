import { router } from '../router';
import { forgetSignedIn, refreshSession } from './auth-client';

/** Erro HTTP da API (status ≠ 2xx). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 401: sessão ausente ou expirada. O app já foi levado para `/login`. */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Sessão expirada. Entre novamente.') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object') {
      const { error, message } = body as { error?: unknown; message?: unknown };
      if (typeof error === 'string' && error) return error;
      if (typeof message === 'string' && message) return message;
    }
  } catch {
    // corpo vazio ou não-JSON
  }
  return res.statusText || `Erro ${res.status}`;
}

/**
 * `fetch` para a API na mesma origem. `path` é o caminho completo (ex.: `/api/entries`).
 * Envia cookies; corpo string vira `Content-Type: application/json`.
 * 401 → navega para `/login` e lança `UnauthorizedError`; outros erros lançam `ApiError`.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const res = await fetch(path, { ...init, headers, credentials: 'include' });

  if (res.status === 401) {
    forgetSignedIn();
    refreshSession();
    if (router.state.location.pathname !== '/login') {
      void router.navigate('/login', { replace: true });
    }
    throw new UnauthorizedError();
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  if (res.status === 204 || res.headers.get('Content-Length') === '0') return undefined as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
