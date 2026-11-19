import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function hasStatus(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number';
}

/**
 * `gcTime` ≥ `maxAge` do persister, senão as queries somem antes de serem
 * restauradas. `offlineFirst` deixa o cache aparecer sem conexão (somente leitura).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: THIRTY_DAYS_MS,
      staleTime: 30_000,
      networkMode: 'offlineFirst',
      // Erros 4xx (incluindo 401) não melhoram com nova tentativa.
      retry: (failureCount, error) => !(hasStatus(error) && error.status < 500) && failureCount < 2,
    },
    mutations: { networkMode: 'online' },
  },
});

/** Persistência do cache em `localStorage` — é o que permite ver os dados offline. */
export const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'pluton-query-cache',
});

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: THIRTY_DAYS_MS,
  buster: 'v1',
};

/** Ao sair: apaga o cache em memória e o persistido (dados pessoais no aparelho). */
export async function clearQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
