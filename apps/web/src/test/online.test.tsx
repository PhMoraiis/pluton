import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('../lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: sessionState.data, isPending: false, isRefetching: false, error: null }),
  },
}));

import { OfflineBanner } from '../components/OfflineBanner';
import { useCanWrite, useOnline } from '../lib/online';

let online = true;

function goOffline() {
  online = false;
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline() {
  online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

beforeEach(() => {
  online = true;
  sessionState.data = null;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useOnline', () => {
  test('useOnline reage aos eventos offline/online', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    goOffline();
    expect(result.current).toBe(false);

    goOnline();
    expect(result.current).toBe(true);
  });

  test('começa offline se navigator.onLine já for false', () => {
    online = false;
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });
});

describe('OfflineBanner', () => {
  test('OfflineBanner aparece com o texto "Você está offline — somente leitura" quando offline', () => {
    render(<OfflineBanner />);
    expect(screen.queryByText('Você está offline — somente leitura')).not.toBeInTheDocument();

    goOffline();
    expect(screen.getByText('Você está offline — somente leitura')).toBeInTheDocument();

    goOnline();
    expect(screen.queryByText('Você está offline — somente leitura')).not.toBeInTheDocument();
  });
});

describe('useCanWrite', () => {
  test('só permite escrita online e autenticado', () => {
    const { result, rerender } = renderHook(() => useCanWrite());
    expect(result.current).toBe(false); // sem sessão

    sessionState.data = { user: { id: 'u1' }, session: { id: 's1' } };
    rerender();
    expect(result.current).toBe(true);

    goOffline();
    expect(result.current).toBe(false);
  });
});
