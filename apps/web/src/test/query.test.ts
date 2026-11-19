import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { type PersistedClient, type Persister, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { persistOptions, queryClient } from '../lib/query';

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
