import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MonthlySeriesDTO, TagDTO } from '@pluton/shared';

vi.mock('../lib/auth-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth-client')>();
  return {
    ...actual,
    authClient: {
      useSession: () => ({ data: { user: { id: 'u1' }, session: { id: 's1' } }, isPending: false, isRefetching: false, error: null }),
      signOut: vi.fn(async () => undefined),
    },
  };
});

import { SettingsPage } from '../pages/SettingsPage';

let series: MonthlySeriesDTO[];
let tags: TagDTO[];
let calls: Array<{ method: string; path: string; search: string; body: Record<string, unknown> | null }>;
let online: boolean;

/** Mesmas regras do zod de `PUT /api/series/:id/tags` (Task 4/5). */
function tagsBodyError(b: Record<string, unknown> | null): string | null {
  const ids = b?.['tagIds'];
  if (!Array.isArray(ids)) return 'invalid_body';
  if (ids.length > 20) return 'invalid_body';
  if (!ids.every((i) => typeof i === 'string' && i.length > 0)) return 'invalid_body';
  if (new Set(ids).size !== ids.length) return 'invalid_body';
  if (!ids.every((i) => tags.some((t) => t.id === i))) return 'invalid_tag';
  return null;
}

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ method, path: url.pathname, search: url.search, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (url.pathname === '/api/payment-methods') return json([]);
      if (url.pathname === '/api/salary') return json(null);
      if (url.pathname === '/api/tags') return json(tags);
      if (url.pathname === '/api/series/monthly') {
        if (url.searchParams.get('kind') !== 'EXPENSE') return json({ error: 'invalid_query' }, 400);
        return json(series);
      }
      const m = /^\/api\/series\/([^/]+)\/tags$/.exec(url.pathname);
      if (m && method === 'PUT') {
        const s = series.find((x) => x.id === m[1]);
        if (!s) return json({ error: 'not_found' }, 404);
        const err = tagsBodyError(body);
        if (err) return json({ error: err }, 400);
        s.tagIds = body!['tagIds'] as string[];
        return json(s);
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = () => screen.getByRole('region', { name: 'Assinaturas' });
const puts = () => calls.filter((c) => c.method === 'PUT' && c.path.startsWith('/api/series/'));

beforeEach(() => {
  online = true;
  calls = [];
  tags = [
    { id: 't-sub', name: 'Assinatura', color: '#D9730D', sortOrder: 0, system: 'SUBSCRIPTION' },
    { id: 't-casa', name: 'Casa', color: '#0B6E99', sortOrder: 1, system: null },
  ];
  series = [
    { id: 's-acad', name: 'Academia', kind: 'EXPENSE', amountCents: 9990, currentMonthCents: 9990, paymentMethodId: null, tagIds: ['t-casa'] },
    { id: 's-spot', name: 'Spotify', kind: 'EXPENSE', amountCents: 2190, currentMonthCents: 2190, paymentMethodId: null, tagIds: ['t-sub', 't-casa'] },
  ];
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
  mockFetch();
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SettingsPage – Assinaturas', () => {
  test('lista só as séries com a etiqueta de sistema e mostra o total', async () => {
    renderSettings();
    const list = await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    expect(within(list).getByText('Spotify')).toBeInTheDocument();
    expect(within(list).queryByText('Academia')).not.toBeInTheDocument();
    expect(within(section()).getByText('R$ 21,90', { selector: 'li *' })).toBeInTheDocument();
    expect(within(section()).getByText(/Total mensal/)).toHaveTextContent('Total mensal R$ 21,90');
    expect(calls.some((c) => c.path === '/api/series/monthly' && c.search === '?kind=EXPENSE')).toBe(true);
  });

  test('a seção Assinaturas vem depois de Etiquetas e antes de Sair', async () => {
    renderSettings();
    await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(['Salário', 'Métodos de pagamento', 'Etiquetas', 'Assinaturas']);
  });

  test('marcar Academia envia a etiqueta preservando as outras', async () => {
    renderSettings();
    await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    const select = within(section()).getByLabelText('Marcar como assinatura');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).not.toContain('Spotify');
    fireEvent.change(select, { target: { value: 's-acad' } });
    fireEvent.click(within(section()).getByRole('button', { name: 'Marcar' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]).toMatchObject({ path: '/api/series/s-acad/tags', body: { tagIds: ['t-casa', 't-sub'] } });
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Assinaturas marcadas' })).getByText('Academia')).toBeInTheDocument(),
    );
    expect(within(section()).getByText(/Total mensal/)).toHaveTextContent('Total mensal R$ 121,80');
  });

  test('marcar com a série sem outras etiquetas envia só a etiqueta de sistema', async () => {
    series[0]!.tagIds = [];
    renderSettings();
    await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    fireEvent.change(within(section()).getByLabelText('Marcar como assinatura'), { target: { value: 's-acad' } });
    fireEvent.click(within(section()).getByRole('button', { name: 'Marcar' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]!.body).toEqual({ tagIds: ['t-sub'] });
  });

  test('remover Spotify envia as etiquetas sem a de sistema', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Spotify das assinaturas' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]).toMatchObject({ path: '/api/series/s-spot/tags', body: { tagIds: ['t-casa'] } });
    await waitFor(() => expect(within(section()).getByText('Nenhuma assinatura marcada.')).toBeInTheDocument());
  });

  test('etiqueta de sistema renomeada continua funcionando (busca por system)', async () => {
    tags[0]!.name = 'Recorrentes';
    renderSettings();
    const list = await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    expect(within(list).getByText('Spotify')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover Spotify das assinaturas' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]!.body).toEqual({ tagIds: ['t-casa'] });
  });

  test('etiqueta excluída no cache da série não vai no PUT (marcar e remover)', async () => {
    series[0]!.tagIds = ['t-gone', 't-casa'];
    series[1]!.tagIds = ['t-sub', 't-gone'];
    renderSettings();
    await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    fireEvent.change(within(section()).getByLabelText('Marcar como assinatura'), { target: { value: 's-acad' } });
    fireEvent.click(within(section()).getByRole('button', { name: 'Marcar' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]).toMatchObject({ path: '/api/series/s-acad/tags', body: { tagIds: ['t-casa', 't-sub'] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Spotify das assinaturas' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1]).toMatchObject({ path: '/api/series/s-spot/tags', body: { tagIds: [] } });
  });

  test('lista vazia mostra a mensagem e total zero', async () => {
    series = [];
    renderSettings();
    expect(await within(section()).findByText('Nenhuma assinatura marcada.')).toBeInTheDocument();
  });

  test('sem a etiqueta de sistema carregada: sem controles e sem erro', async () => {
    tags = [{ id: 't-casa', name: 'Casa', color: '#0B6E99', sortOrder: 1, system: null }];
    renderSettings();
    await screen.findByRole('heading', { name: 'Assinaturas' });
    await waitFor(() => expect(calls.some((c) => c.path === '/api/tags')).toBe(true));
    expect(screen.queryByRole('button', { name: 'Marcar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover .* das assinaturas/ })).not.toBeInTheDocument();
  });

  test('erro da API ao marcar aparece como alerta', async () => {
    renderSettings();
    await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    series = series.filter((s) => s.id !== 's-acad'); // some do servidor: 404
    fireEvent.change(within(section()).getByLabelText('Marcar como assinatura'), { target: { value: 's-acad' } });
    fireEvent.click(within(section()).getByRole('button', { name: 'Marcar' }));
    expect(await within(section()).findByRole('alert')).toBeInTheDocument();
  });

  test('offline: seletor e botões ficam desabilitados', async () => {
    renderSettings();
    await screen.findByRole('list', { name: 'Assinaturas marcadas' });
    online = false;
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(within(section()).getByRole('button', { name: 'Marcar' })).toBeDisabled());
    expect(within(section()).getByLabelText('Marcar como assinatura')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover Spotify das assinaturas' })).toBeDisabled();
  });
});
