import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import {
  removeOldestQuery,
  type PersistQueryClientProviderProps,
  type Persister,
} from '@tanstack/react-query-persist-client';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function hasStatus(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number';
}

/**
 * `gcTime` ≥ `maxAge` do persister, senão as queries somem antes de serem
 * restauradas. Tem de ser `Infinity` (GC desligado): qualquer valor acima de
 * 2^31-1 ms (~24,8 dias) estoura o `setTimeout` e o GC roda em ~1 ms, apagando o
 * cache restaurado antes de as telas montarem — offline ficaria sem dados. A
 * validade do cache persistido continua limitada pelo `maxAge` (30 dias).
 * `offlineFirst` deixa o cache aparecer sem conexão (somente leitura).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,
      staleTime: 30_000,
      networkMode: 'offlineFirst',
      // Erros 4xx (incluindo 401) não melhoram com nova tentativa.
      retry: (failureCount, error) => !(hasStatus(error) && error.status < 500) && failureCount < 2,
    },
    // Offline = somente leitura, nada é enfileirado: com 'online' o TanStack Query
    // pausaria a mutação e a reenviaria ao reconectar. 'always' executa na hora,
    // e sem conexão o fetch falha imediatamente.
    mutations: { networkMode: 'always' },
  },
});

/**
 * Persistência do cache em `storage` (no app, `localStorage`). Cota estourada: descarta a
 * query mais antiga e tenta de novo — sem isso a gravação falha para sempre e a cópia
 * offline fica congelada na última versão que coube.
 */
export function createPersister(storage: Storage | undefined): Persister {
  return createSyncStoragePersister({
    storage,
    key: 'pluton-query-cache',
    retry: removeOldestQuery,
  });
}

/** Persistência do cache em `localStorage` — é o que permite ver os dados offline. */
export const persister = createPersister(typeof window !== 'undefined' ? window.localStorage : undefined);

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: THIRTY_DAYS_MS,
  buster: 'v1',
  // Só queries vão para o armazenamento; mutações (mesmo pausadas) nunca são persistidas.
  dehydrateOptions: { shouldDehydrateMutation: () => false },
};

/** Ao sair: apaga o cache em memória e o persistido (dados pessoais no aparelho). */
export async function clearQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
