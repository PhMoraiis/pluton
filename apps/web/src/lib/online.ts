import { useSyncExternalStore } from 'react';
import { authClient } from './auth-client';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** `navigator.onLine`, atualizado pelos eventos `online`/`offline`. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Pode escrever = online e autenticado. Offline é somente leitura: todo botão ou
 * ação de escrita usa `disabled={!canWrite}`; nada é enfileirado.
 */
export function useCanWrite(): boolean {
  const online = useOnline();
  const { data } = authClient.useSession();
  return online && data != null;
}
