import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EntryDTO, PaymentMethodDTO, Summary, TagDTO } from '@pluton/shared';

const sessionState = vi.hoisted(() => ({ data: { user: { id: 'u1' }, session: { id: 's1' } } as unknown }));
vi.mock('../lib/auth-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth-client')>();
  return {
    ...actual,
    authClient: {
      useSession: () => ({ data: sessionState.data, isPending: false, isRefetching: false, error: null }),
    },
  };
});

import { HistoryPage } from '../pages/HistoryPage';
import { PeriodPage } from '../pages/PeriodPage';

// O Testing Library normaliza U+00A0 (saída de formatBRL) para espaço comum ao casar texto.
const SP = ' ';
const methods: PaymentMethodDTO[] = [{ id: 'm-pix', name: 'Pix', color: '#2eaadc', sortOrder: 0, chargeNextMonth: false }];

const tags: TagDTO[] = [{ id: 't-sub', name: 'Assinatura', color: '#D9730D', sortOrder: 0, system: 'SUBSCRIPTION' }];

function entry(over: Partial<EntryDTO> & Pick<EntryDTO, 'id' | 'displayName' | 'amountCents' | 'dueDate'>): EntryDTO {
  return {
    kind: 'EXPENSE',
    name: over.displayName,
    paymentMethodId: null,
    pixKey: null,
    note: '',
    paidOn: null,
    seriesId: null,
    seriesType: null,
    sequence: null,
    totalInstallments: null,
    tagIds: [],
    seriesRole: null,
    amountAdjusted: false,
    ...over,
  };
}

let entries: EntryDTO[];
let summary: Summary;
let requested: string[];
let online: boolean;

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      requested.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const invalidQuery = () => new Response(JSON.stringify({ error: 'invalid_query' }), { status: 400 });
      const q = url.searchParams;
      if (url.pathname === '/api/entries') {
        // Regras reais da API: from e to juntos; sem eles só com status=pending.
        if ((q.has('from') !== q.has('to')) || (!q.has('from') && q.get('status') !== 'pending')) return invalidQuery();
        return json(entries);
      }
      if (url.pathname === '/api/summary') {
        if (!q.has('from') || !q.has('to')) return invalidQuery();
        return json(summary);
      }
      if (url.pathname === '/api/payment-methods') return json(methods);
      if (url.pathname === '/api/tags') return json(tags);
      if (/^\/api\/entries\/[^/]+\/pay$/.test(url.pathname)) return json(entries[0]);
      return new Response('not found', { status: 404 });
    }),
  );
}

function setViewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

function tree(client: QueryClient, ui: React.ReactNode) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderWith(ui: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) {
  return render(tree(client, ui));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-18T15:00:00Z') });
  entries = [];
  summary = { expenseCents: 0, expensePaidCents: 0, incomeCents: 0, incomePaidCents: 0, balanceCents: 0, realizedCents: 0 };
  requested = [];
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
  mockFetch();
  setViewport(true);
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HistoryPage', () => {
  test('histórico agrupa por mês de vencimento com total no cabeçalho ("out. de 2026" / "R$ 2.233,45")', async () => {
    entries = [
      entry({ id: 'a', displayName: 'Aluguel', amountCents: 190000, dueDate: '2026-10-05', paidOn: '2026-10-04', paymentMethodId: 'm-pix' }),
      entry({ id: 'b', displayName: 'Luz', amountCents: 33345, dueDate: '2026-10-20', paidOn: '2026-10-20' }),
      entry({ id: 'c', displayName: 'Internet', amountCents: 9990, dueDate: '2026-11-10', paidOn: '2026-11-10' }),
    ];
    renderWith(<HistoryPage />);

    const out = await screen.findByRole('region', { name: 'out. de 2026' });
    expect(within(out).getByRole('heading', { name: 'out. de 2026' })).toBeInTheDocument();
    expect(within(out).getByText(`R$${SP}2.233,45`)).toBeInTheDocument();
    expect(within(out).getByText('Aluguel')).toBeInTheDocument();
    expect(within(out).getByText('Pix')).toBeInTheDocument();
    const nov = screen.getByRole('region', { name: 'nov. de 2026' });
    expect(within(within(nov).getByRole('banner')).getByText(`R$${SP}99,90`)).toBeInTheDocument();
    expect(requested).toContain('GET /api/entries?kind=EXPENSE&from=2026-06&to=2027-11&status=paid');
  });

  test('conta que vence 2026-12-05 e foi paga 2026-11-28 aparece na coluna de dez.', async () => {
    entries = [entry({ id: 'x', displayName: 'Seguro', amountCents: 5000, dueDate: '2026-12-05', paidOn: '2026-11-28' })];
    renderWith(<HistoryPage />);

    const dez = await screen.findByRole('region', { name: 'dez. de 2026' });
    expect(within(dez).getByText('Seguro')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'nov. de 2026' })).queryByText('Seguro')).not.toBeInTheDocument();
  });

  test('mostra o chip da etiqueta no cartão do histórico', async () => {
    entries = [entry({ id: 'x', displayName: 'Netflix', amountCents: 5000, dueDate: '2026-11-05', paidOn: '2026-11-05', tagIds: ['t-sub'] })];
    renderWith(<HistoryPage />);
    const card = (await screen.findByText('Netflix')).closest('li')!;
    expect(await within(card).findByText('Assinatura')).toBeInTheDocument();
  });

  test('salário pago mostra a etiqueta "Salário" no histórico', async () => {
    entries = [
      entry({ id: 's', kind: 'INCOME', displayName: 'Salário', amountCents: 500000, dueDate: '2026-10-05', paidOn: '2026-10-05', seriesRole: 'SALARY', amountAdjusted: true }),
    ];
    renderWith(<HistoryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Ganhos' }));

    const out = await screen.findByRole('region', { name: 'out. de 2026' });
    expect(within(out).getAllByText('Salário')).toHaveLength(2); // nome + etiqueta
    expect(within(out).queryByText(/Salário ·/)).not.toBeInTheDocument();
  });

  test('desmarcar pago envia pay { paid: false }', async () => {
    entries = [entry({ id: 'x', displayName: 'Luz', amountCents: 5000, dueDate: '2026-11-05', paidOn: '2026-11-05' })];
    renderWith(<HistoryPage />);

    fireEvent.click(await screen.findByRole('checkbox', { name: /Luz/ }));
    await waitFor(() => expect(requested).toContain('POST /api/entries/x/pay'));
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) => String(u).endsWith('/pay'));
    expect(JSON.parse(call![1].body)).toEqual({ paid: false });
  });

  test('desmarcar pago fica desabilitado offline', async () => {
    entries = [entry({ id: 'x', displayName: 'Luz', amountCents: 5000, dueDate: '2026-11-05', paidOn: '2026-11-05' })];
    online = false;
    renderWith(<HistoryPage />);

    expect(await screen.findByRole('checkbox', { name: /Luz/ })).toBeDisabled();
  });

  test('"Carregar mais" busca 6 meses anteriores', async () => {
    renderWith(<HistoryPage />);
    await screen.findByRole('region', { name: 'nov. de 2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('region', { name: 'dez. de 2025' })).toBeInTheDocument();
    expect(requested).toContain('GET /api/entries?kind=EXPENSE&from=2025-12&to=2027-11&status=paid');
  });

  test('alternar para Ganhos consulta kind=INCOME', async () => {
    renderWith(<HistoryPage />);
    await screen.findByRole('region', { name: 'nov. de 2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Ganhos' }));
    await waitFor(() => expect(requested).toContain('GET /api/entries?kind=INCOME&from=2026-06&to=2027-11&status=paid'));
  });

  test('no celular mostra um mês por vez com setas', async () => {
    setViewport(false);
    entries = [entry({ id: 'a', displayName: 'Aluguel', amountCents: 1000, dueDate: '2026-10-05', paidOn: '2026-10-05' })];
    renderWith(<HistoryPage />);

    await screen.findByRole('region', { name: 'nov. de 2026' });
    expect(screen.queryByRole('region', { name: 'out. de 2026' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByRole('region', { name: 'out. de 2026' })).toBeInTheDocument();
    expect(screen.getByText('Aluguel')).toBeInTheDocument();
  });

  test('no celular, ‹ na coluna mais antiga carrega mais e vai para o mês anterior', async () => {
    setViewport(false);
    renderWith(<HistoryPage />);
    await screen.findByRole('region', { name: 'nov. de 2026' });
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByRole('region', { name: 'jun. de 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByRole('region', { name: 'mai. de 2026' })).toBeInTheDocument();
  });

  test('mantém os dados e avisa "Mostrando dados salvos" quando a recarga falha', async () => {
    entries = [entry({ id: 'x', displayName: 'Luz', amountCents: 5000, dueDate: '2026-11-05', paidOn: '2026-11-05' })];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    renderWith(<HistoryPage />, client);
    await screen.findByText('Luz');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await client.invalidateQueries({ queryKey: ['entries'] });

    expect(await screen.findByText('Mostrando dados salvos')).toBeInTheDocument();
    expect(screen.getByText('Luz')).toBeInTheDocument();
  });
});

describe('PeriodPage', () => {
  test('PeriodPage mostra Realizado com o valor de /api/summary', async () => {
    summary = { expenseCents: 100000, expensePaidCents: 0, incomeCents: 250000, incomePaidCents: 0, balanceCents: 150000, realizedCents: 123456 };
    renderWith(<PeriodPage />);

    expect(await screen.findByText(`R$${SP}1.234,56`)).toBeInTheDocument();
    expect(screen.getByText('Realizado')).toBeInTheDocument();
    expect(screen.getByText('Despesas')).toBeInTheDocument();
    expect(screen.getByText('Ganhos')).toBeInTheDocument();
    expect(screen.getByText('Ganhos − Despesas')).toBeInTheDocument();
    expect(requested).toContain('GET /api/summary?from=2026-01&to=2026-11');
  });

  test('campos de mês orientam o formato AAAA-MM (Safari mostra caixa de texto)', async () => {
    renderWith(<PeriodPage />);
    await waitFor(() => expect(requested).toContain('GET /api/summary?from=2026-01&to=2026-11'));
    requested.length = 0;
    for (const label of ['Início', 'Fim']) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute('placeholder', 'AAAA-MM');
      expect(field).toHaveAttribute('pattern', '\\d{4}-(0[1-9]|1[0-2])');
      expect(field).toHaveAttribute('title', 'Use o formato AAAA-MM, por exemplo 2026-12.');
    }
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-13' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o mês inicial e o final no formato AAAA-MM (ex.: 2026-01).');
    expect(requested).toEqual([]);
  });

  test('início depois do fim mostra aviso e não consulta', async () => {
    renderWith(<PeriodPage />);
    await waitFor(() => expect(requested).toContain('GET /api/summary?from=2026-01&to=2026-11'));
    requested.length = 0;
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-12' } });
    expect(screen.getByRole('alert')).toHaveTextContent('não pode ser depois');
    expect(requested).toEqual([]);
  });
});
