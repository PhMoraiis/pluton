import { useState } from 'react';
import { useNavigate } from 'react-router';
import { authClient, forgetSignedIn } from './auth-client';
import { clearQueryCache } from './query';

/** Encerra a sessão, apaga o cache persistido e leva para `/login`. */
export function useSignOut(): { signOut: () => Promise<void>; signingOut: boolean } {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      forgetSignedIn();
      await clearQueryCache();
      setSigningOut(false);
      void navigate('/login', { replace: true });
    }
  }

  return { signOut, signingOut };
}
