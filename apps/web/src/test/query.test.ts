import { MutationObserver, onlineManager } from '@tanstack/react-query';
import {
  type PersistedClient,
  type Persister,
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createPersister, persistOptions, queryClient } from '../lib/query';

const PENDING = Symbol('pending');

/** Resolve com o resultado da promessa ou com PENDING se ela ficar parada (mutação pausada). */
function settleOrPending<T>(promise: Promise<T>, ms = 100): Promise<T | unknown> {
  return Promise.race([
    promise.then(
      (value) => value,
      (error: unknown) => error,
    ),
    new Promise((resolve) => setTimeout(() => resolve(PENDING), ms)),
  ]);
}

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

describe('offline = somente leitura (nada é enfileirado)', () => {
  test('mutação disparada offline falha na hora em vez de ficar pausada para reenvio', async () => {
    onlineManager.setOnline(false);
    const mutationFn = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    const outcome = await settleOrPending(new MutationObserver(queryClient, { mutationFn }).mutate());

    expect(outcome).toBeInstanceOf(TypeError);
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getMutationCache().getAll().some((m) => m.state.isPaused)).toBe(false);
  });

  test('nenhuma mutação é persistida no localStorage, nem uma pausada', async () => {
    onlineManager.setOnline(false);
    // Força uma mutação pausada (networkMode 'online' explícito) para provar o filtro do persister.
    void new MutationObserver(queryClient, {
      mutationFn: () => Promise.resolve('ok'),
      networkMode: 'online',
    })
      .mutate()
      .catch(() => {});
    expect(queryClient.getMutationCache().getAll().some((m) => m.state.isPaused)).toBe(true);

    let saved: PersistedClient | undefined;
    const memoryPersister: Persister = {
      persistClient: (client) => {
        saved = client;
      },
      restoreClient: () => undefined,
      removeClient: () => {},
    };
    await persistQueryClientSave({
      queryClient,
      persister: memoryPersister,
      dehydrateOptions: persistOptions.dehydrateOptions,
    });

    expect(saved?.clientState.mutations).toEqual([]);
  });
});

describe('cache persistido (leitura offline)', () => {
  test('dados restaurados continuam no cache até as telas montarem', async () => {
    // Persistido "agora", com uma query de sucesso e nenhum observer (o app ainda
    // está checando a sessão quando a restauração termina).
    const now = Date.now();
    const persisted: PersistedClient = {
      buster: persistOptions.buster ?? '',
      timestamp: now,
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['payment-methods'],
            queryHash: '["payment-methods"]',
            dehydratedAt: now,
            state: {
              data: [{ id: 'm1' }],
              dataUpdateCount: 1,
              dataUpdatedAt: now,
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
            },
          },
        ],
      },
    };
    const memoryPersister: Persister = {
      persistClient: () => {},
      restoreClient: () => persisted,
      removeClient: () => {},
    };

    await persistQueryClientRestore({ ...persistOptions, persister: memoryPersister, queryClient });
    // gcTime acima de 2^31-1 ms estoura o setTimeout e o GC roda em ~1 ms.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(queryClient.getQueryData(['payment-methods'])).toEqual([{ id: 'm1' }]);
  });
});

describe('cache persistido: armazenamento cheio', () => {
  function query(key: string, updatedAt: number, size: number): PersistedClient['clientState']['queries'][number] {
    return {
      queryKey: [key],
      queryHash: JSON.stringify([key]),
      dehydratedAt: updatedAt,
      state: {
        data: 'x'.repeat(size),
        dataUpdateCount: 1,
        dataUpdatedAt: updatedAt,
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
        status: 'success',
        fetchStatus: 'idle',
      },
    };
  }

  test('estouro de cota descarta as queries mais antigas em vez de congelar a cópia offline', () => {
    vi.useFakeTimers();
    try {
      const stored = new Map<string, string>();
      // Cabe ~1 query de 3 KB; acima de 5 KB o "localStorage" acusa cota estourada.
      const storage = {
        getItem: (k: string) => stored.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (v.length > 5_000) throw new DOMException('cheio', 'QuotaExceededError');
          stored.set(k, v);
        },
        removeItem: (k: string) => void stored.delete(k),
      } as unknown as Storage;
      const persister = createPersister(storage);

      void persister.persistClient({
        buster: 'v1',
        timestamp: 2,
        clientState: { mutations: [], queries: [query('antiga', 1, 3_000), query('nova', 2, 3_000)] },
      });
      vi.runAllTimers();

      const saved = JSON.parse(stored.get('pluton-query-cache') ?? 'null') as PersistedClient | null;
      expect(saved?.clientState.queries.map((q) => q.queryKey)).toEqual([['nova']]);
    } finally {
      vi.useRealTimers();
    }
  });
});
