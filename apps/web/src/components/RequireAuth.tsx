import { type ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router';
import { authClient, rememberSignedIn, wasSignedIn } from '../lib/auth-client';
import { useOnline } from '../lib/online';

/**
 * Guard das rotas autenticadas. `authClient.useSession()` chama o get-session do
 * Better Auth ao abrir o app e quando a janela volta a ficar visível, o que
 * mantém o cookie de sessão renovado.
 *
 * Sem conexão (ou API inalcançável) e com sessão anterior neste aparelho, mostra
 * o app com o cache local em modo somente leitura (`useCanWrite()` = false).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending, error } = authClient.useSession();
  const online = useOnline();

  useEffect(() => {
    if (data) rememberSignedIn();
  }, [data]);

  if (data) return children;
  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted" role="status">
        Carregando…
      </div>
    );
  }
  const unreachable = !online || (error != null && error.status !== 401);
  if (unreachable && wasSignedIn()) return children;
  return <Navigate to="/login" replace />;
}
