import { useCallback, useSyncExternalStore } from 'react';

/** `window.matchMedia(query).matches`, reativo. Sem `matchMedia`, assume `false`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Tabela a partir de 768px (breakpoint `md`); abaixo disso, cartões. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
