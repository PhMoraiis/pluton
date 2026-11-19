import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EntryDTO, EntryKind, PaymentMethodDTO, Summary } from '@pluton/shared';
import { queryKeys } from '../lib/queryKeys';
import { EntriesPage } from '../pages/EntriesPage';

// O Testing Library normaliza U+00A0 (saída de formatBRL) para espaço comum ao casar texto.
const SP = ' ';

const methods: PaymentMethodDTO[] = [
  { id: 'm-pix', name: 'Pix', color: '#2eaadc', sortOrder: 0 },
  { id: 'm-card', name: 'Cartão de crédito', color: '#e255a1', sortOrder: 1 },
];

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

interface Server {
  entries: EntryDTO[];
  overdue: EntryDTO[];
  defaultMonth: string;
  summary: Summary;
}

let server: Server;
let requested: string[];
let failing: Set<string>;

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      requested.push(url.pathname + url.search);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (failing.has(url.pathname)) return new Response('boom', { status: 500 });
      switch (url.pathname) {
        case '/api/entries':
          return json(server.entries);
        case '/api/entries/overdue':
          return json(server.overdue);
        case '/api/default-month':
          return json({ month: server.defaultMonth });
        case '/api/summary':
          return json(server.summary);
        case '/api/payment-methods':
          return json(methods);
        default:
          return new Response('not found', { status: 404 });
      }
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

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

function renderPage(
  kind: EntryKind = 'EXPENSE',
  url = '/',
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <EntriesPage kind={kind} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requested = [];
  failing = new Set();
  server = {
    entries: [],
    overdue: [],
    defaultMonth: '2026-12',
    summary: { expenseCents: 0, expensePaidCents: 0, incomeCents: 0, incomePaidCents: 0, balanceCents: 0, realizedCents: 0 },
  };
  mockFetch();
  setViewport(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EntriesPage (leitura)', () => {
  test('mostra displayName "Fone 3/7", "R$ 42,90" e "5 de dezembro de 2026"', async () => {
    server.entries = [entry({ id: 'e1', displayName: 'Fone 3/7', amountCents: 4290, dueDate: '2026-12-05' })];

    renderPage();

    expect(await screen.findByText('Fone 3/7')).toBeInTheDocument();
    expect(screen.getByText(`R$${SP}42,90`)).toBeInTheDocument();
    expect(screen.getByText('5 de dezembro de 2026')).toBeInTheDocument();
    expect(requested).toContain('/api/entries?kind=EXPENSE&from=2026-12&to=2026-12&status=pending');
  });

  test('também mostra os dados em cartões no celular', async () => {
    setViewport(false);
    server.entries = [entry({ id: 'e1', displayName: 'Fone 3/7', amountCents: 4290, dueDate: '2026-12-05' })];

    renderPage();

    expect(await screen.findByText('Fone 3/7')).toBeInTheDocument();
    expect(screen.getByText(`R$${SP}42,90`)).toBeInTheDocument();
    expect(screen.getByText('5 de dezembro de 2026')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Fone 3\/7/ })).toBeDisabled();
  });

  test('rodapé com CONTAGEM 2 e SOMA R$ 1.717,96 para os valores 171096 + 700', async () => {
    server.entries = [
      entry({ id: 'e1', displayName: 'Obra', amountCents: 171096, dueDate: '2026-12-05' }),
      entry({ id: 'e2', displayName: 'Café', amountCents: 700, dueDate: '2026-12-09' }),
    ];

    renderPage();

    await screen.findByText('Obra');
    const footer = screen.getByTestId('entries-footer');
    expect(footer).toHaveTextContent('CONTAGEM 2');
    expect(footer).toHaveTextContent(/SOMA\s+R\$\s+1\.717,96/);
  });

  test('filtro por método e busca por nome atualizam linhas e rodapé', async () => {
    server.entries = [
      entry({ id: 'e1', displayName: 'Aluguel', amountCents: 100000, dueDate: '2026-12-05', paymentMethodId: 'm-pix' }),
      entry({ id: 'e2', displayName: 'Mercado', amountCents: 25000, dueDate: '2026-12-06', paymentMethodId: 'm-card' }),
      entry({ id: 'e3', displayName: 'Mercadinho', amountCents: 500, dueDate: '2026-12-07', paymentMethodId: 'm-pix' }),
    ];

    renderPage();
    await screen.findByText('Aluguel');
    const footer = screen.getByTestId('entries-footer');
    expect(footer).toHaveTextContent('CONTAGEM 3');

    const filters = await screen.findByRole('group', { name: 'Método de pagamento' });
    fireEvent.click(within(filters).getByRole('button', { name: 'Pix' }));
    expect(screen.queryByText('Mercado')).not.toBeInTheDocument();
    expect(screen.getByText('Aluguel')).toBeInTheDocument();
    expect(footer).toHaveTextContent('CONTAGEM 2');
    expect(footer).toHaveTextContent(/SOMA\s+R\$\s+1\.005,00/);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nome' }), { target: { value: 'MERCA' } });
    expect(screen.queryByText('Aluguel')).not.toBeInTheDocument();
    expect(screen.getByText('Mercadinho')).toBeInTheDocument();
    expect(footer).toHaveTextContent('CONTAGEM 1');
    expect(footer).toHaveTextContent(/SOMA\s+R\$\s+5,00/);
  });

  test('atrasados aparecem no topo mesmo com outro mês selecionado e não duplicam na lista do mês', async () => {
    const late = entry({ id: 'late', displayName: 'Luz 2/3', amountCents: 15000, dueDate: '2026-10-10' });
    server.overdue = [late];
    server.entries = [late, entry({ id: 'e1', displayName: 'Internet', amountCents: 9990, dueDate: '2027-01-10' })];

    renderPage('EXPENSE', '/?mes=2027-01');

    const section = await screen.findByRole('region', { name: 'Atrasados' });
    expect(within(section).getByText('Luz 2/3')).toBeInTheDocument();
    expect(await screen.findByText('Internet')).toBeInTheDocument();
    expect(screen.getAllByText('Luz 2/3')).toHaveLength(1);
    expect(screen.getByTestId('entries-footer')).toHaveTextContent('CONTAGEM 1');
    expect(requested).toContain('/api/summary?from=2027-01&to=2027-01');
  });

  test('"Todos os pendentes" lista status=pending sem filtro de mês', async () => {
    server.entries = [entry({ id: 'e1', displayName: 'Internet', amountCents: 9990, dueDate: '2027-03-10' })];

    renderPage();
    await screen.findByText('Internet');
    fireEvent.click(screen.getByRole('button', { name: 'Todos os pendentes' }));

    await waitFor(() => expect(requested).toContain('/api/entries?kind=EXPENSE&status=pending'));
  });

  test('SummaryBar mostra Despesas, Ganhos, Ganhos − Despesas e não exibe "Realizado"', async () => {
    server.summary = {
      expenseCents: 217896,
      expensePaidCents: 12700,
      incomeCents: 500000,
      incomePaidCents: 0,
      balanceCents: 282104,
      realizedCents: 1,
    };

    renderPage();

    expect(await screen.findByText(`R$${SP}2.178,96`)).toBeInTheDocument();
    const bar = screen.getByLabelText('Resumo do mês');
    expect(within(bar).getByText('Despesas')).toBeInTheDocument();
    expect(within(bar).getByText('Ganhos')).toBeInTheDocument();
    expect(within(bar).getByText('Ganhos − Despesas')).toBeInTheDocument();
    expect(screen.queryByText(/realizado/i)).not.toBeInTheDocument();
    expect(within(bar).getByText(`pago R$${SP}127,00 · a pagar R$${SP}2.051,96`)).toBeInTheDocument();
    expect(within(bar).getByText(`recebido R$${SP}0,00 · a receber R$${SP}5.000,00`)).toBeInTheDocument();
  });

  test('ganhos usam kind=INCOME', async () => {
    renderPage('INCOME');
    await waitFor(() => expect(requested.some((r) => r.startsWith('/api/entries?kind=INCOME'))).toBe(true));
  });

  test('com dados em cache e refetch falhando (offline), mostra a lista salva e o rodapé', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(queryKeys.entries({ kind: 'EXPENSE', from: '2026-12', to: '2026-12', status: 'pending' }), [
      entry({ id: 'e1', displayName: 'Obra', amountCents: 171096, dueDate: '2026-12-05' }),
    ]);
    client.setQueryData(queryKeys.defaultMonth('EXPENSE'), { month: '2026-12' });
    failing = new Set(['/api/entries', '/api/default-month', '/api/summary', '/api/entries/overdue', '/api/payment-methods']);

    renderPage('EXPENSE', '/', client);

    expect(await screen.findByText('Obra')).toBeInTheDocument();
    expect(await screen.findByText('Mostrando dados salvos')).toBeInTheDocument();
    expect(screen.getByTestId('entries-footer')).toHaveTextContent('CONTAGEM 1');
    expect(screen.queryByText('Não foi possível carregar os lançamentos.')).not.toBeInTheDocument();
  });

  test('falha ao carregar atrasados e resumo sem dados mostra aviso em vez de sumir', async () => {
    failing = new Set(['/api/entries/overdue', '/api/summary']);

    renderPage();

    expect(await screen.findByText('Não foi possível carregar os atrasados.')).toBeInTheDocument();
    expect(await screen.findByText('Não foi possível carregar o resumo.')).toBeInTheDocument();
  });

  describe('ordenação', () => {
    const sortRows = () => [
      entry({ id: 'a', displayName: 'Aluguel', amountCents: 50000, dueDate: '2026-12-05' }),
      entry({ id: 'b', displayName: 'Café', amountCents: 700, dueDate: '2026-12-06' }),
      entry({ id: 'c', displayName: 'Mercado', amountCents: 25000, dueDate: '2026-12-07' }),
    ];
    const tableNames = () =>
      within(screen.getByRole('table', { name: 'Lançamentos de despesas' }))
        .getAllByRole('row')
        .map((r) => r.textContent ?? '')
        .filter((t) => /Aluguel|Café|Mercado/.test(t))
        .map((t) => /Aluguel|Café|Mercado/.exec(t)![0]);
    const location = () => screen.getByTestId('location').textContent;

    test('clicar em "Valor" ordena crescente, de novo decrescente, e grava ?ordem= na URL', async () => {
      server.entries = sortRows();
      renderPage();
      await screen.findByText('Aluguel');
      expect(tableNames()).toEqual(['Aluguel', 'Café', 'Mercado']);

      fireEvent.click(screen.getByRole('button', { name: /^Valor/ }));
      expect(tableNames()).toEqual(['Café', 'Mercado', 'Aluguel']);
      expect(screen.getByRole('columnheader', { name: /Valor/ })).toHaveAttribute('aria-sort', 'ascending');
      expect(screen.getByRole('columnheader', { name: /Nome/ })).toHaveAttribute('aria-sort', 'none');
      expect(location()).toContain('ordem=valor-asc');

      fireEvent.click(screen.getByRole('button', { name: /^Valor/ }));
      expect(tableNames()).toEqual(['Aluguel', 'Mercado', 'Café']);
      expect(screen.getByRole('columnheader', { name: /Valor/ })).toHaveAttribute('aria-sort', 'descending');
      expect(location()).toContain('ordem=valor-desc');

      fireEvent.click(screen.getByRole('button', { name: /^Valor/ }));
      expect(location()).not.toContain('ordem');
      expect(tableNames()).toEqual(['Aluguel', 'Café', 'Mercado']);
    });

    test.each(['foo', 'valor'])('?ordem=%s inválido usa a ordem padrão e não quebra', async (bad) => {
      server.entries = sortRows();
      renderPage('EXPENSE', `/?mes=2026-12&ordem=${bad}`);
      await screen.findByText('Aluguel');
      expect(tableNames()).toEqual(['Aluguel', 'Café', 'Mercado']);
      expect(screen.getByRole('columnheader', { name: /Valor/ })).toHaveAttribute('aria-sort', 'none');
    });

    test('trocar o mês mantém ordem e ordenar mantém mes', async () => {
      server.entries = sortRows();
      renderPage('EXPENSE', '/?mes=2026-12&ordem=valor-desc');
      await screen.findByText('Aluguel');
      expect(tableNames()).toEqual(['Aluguel', 'Mercado', 'Café']);

      fireEvent.click(screen.getByRole('button', { name: 'Mês seguinte' }));
      expect(location()).toContain('mes=2027-01');
      expect(location()).toContain('ordem=valor-desc');

      fireEvent.click(await screen.findByRole('button', { name: /^Nome/ }));
      expect(location()).toContain('mes=2027-01');
      expect(location()).toContain('ordem=nome-asc');
    });

    test('atrasados continuam por data e sem botões de ordenação', async () => {
      server.overdue = [
        entry({ id: 'o2', displayName: 'Zeta', amountCents: 100, dueDate: '2026-10-20' }),
        entry({ id: 'o1', displayName: 'Alfa', amountCents: 900, dueDate: '2026-10-10' }),
      ];
      server.entries = sortRows();
      renderPage('EXPENSE', '/?mes=2026-12&ordem=valor-desc');
      const section = await screen.findByRole('region', { name: 'Atrasados' });
      await screen.findByText('Aluguel');
      const order = within(section)
        .getAllByRole('row')
        .map((r) => /Zeta|Alfa/.exec(r.textContent ?? '')?.[0])
        .filter(Boolean);
      expect(order).toEqual(['Zeta', 'Alfa']);
      expect(within(section).queryByRole('button', { name: /^Valor/ })).not.toBeInTheDocument();
    });

    test('no celular, o seletor "Ordenar por" reordena os cartões e atualiza a URL', async () => {
      setViewport(false);
      server.entries = sortRows();
      renderPage();
      await screen.findByText('Aluguel');
      const select = screen.getByRole('combobox', { name: 'Ordenar por' });
      expect(within(select).getAllByRole('option')).toHaveLength(9);

      fireEvent.change(select, { target: { value: 'valor-desc' } });
      const text = document.body.textContent ?? '';
      expect(text.indexOf('Aluguel')).toBeLessThan(text.indexOf('Mercado'));
      expect(text.indexOf('Mercado')).toBeLessThan(text.indexOf('Café'));
      expect(location()).toContain('ordem=valor-desc');
      expect(within(select).getByRole('option', { name: 'Valor (maior primeiro)' })).toBeInTheDocument();

      fireEvent.change(select, { target: { value: '' } });
      expect(location()).not.toContain('ordem');
    });
  });
});
