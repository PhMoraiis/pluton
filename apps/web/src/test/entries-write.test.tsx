import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EntryDTO, PaymentMethodDTO } from '@pluton/shared';

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

import { UndoToast } from '../components/UndoToast';
import { EntriesPage } from '../pages/EntriesPage';

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
    ...over,
  };
}

function installment(over: Partial<EntryDTO> = {}): EntryDTO {
  return entry({
    id: 'e1',
    name: 'Fone',
    displayName: 'Fone 3/7',
    amountCents: 4290,
    dueDate: '2026-12-05',
    seriesId: 's1',
    seriesType: 'INSTALLMENT',
    sequence: 3,
    totalInstallments: 7,
    ...over,
  });
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

let entries: EntryDTO[];
let calls: Call[];
/** Resposta customizada para escrita (status + corpo); `null` = comportamento padrão. */
let writeResponse: { status: number; body: unknown } | null;
/** Promessa que segura a resposta do `pay` (para ver o update otimista antes dela). */
let payGate: Promise<void> | null;
let online: boolean;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init.method ?? 'GET').toUpperCase();
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      if (method !== 'GET') calls.push({ method, path: url.pathname + url.search, body });

      if (method !== 'GET' && writeResponse) return json(writeResponse.body, writeResponse.status);

      const pay = /^\/api\/entries\/([^/]+)\/pay$/.exec(url.pathname);
      if (pay && method === 'POST') {
        if (payGate) await payGate;
        const target = entries.find((e) => e.id === pay[1])!;
        target.paidOn = (body as { paid: boolean }).paid ? '2026-11-18' : null;
        return json(target);
      }
      if (url.pathname === '/api/entries' && method === 'POST') return json([], 201);
      if (url.pathname.startsWith('/api/entries/') && method === 'PATCH') return json([]);
      if (url.pathname.startsWith('/api/entries/') && method === 'DELETE') return new Response(null, { status: 204 });
      if (url.pathname.startsWith('/api/series/')) return new Response(null, { status: 204 });

      switch (url.pathname) {
        case '/api/entries': {
          const pending = url.searchParams.get('status') === 'pending';
          return json(entries.filter((e) => !pending || e.paidOn === null || e.id.startsWith('paid')));
        }
        case '/api/entries/overdue':
          return json([]);
        case '/api/default-month':
          return json({ month: '2026-12' });
        case '/api/summary':
          return json({ expenseCents: 0, incomeCents: 0, balanceCents: 0, realizedCents: 0 });
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

function renderPage(url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <EntriesPage kind="EXPENSE" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  entries = [];
  calls = [];
  writeResponse = null;
  payGate = null;
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
  mockFetch();
  setViewport(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EntriesPage (escrita)', () => {
  test('digitar "Fone 1/7" + "42,90" + Enter faz POST com name "Fone 1/7", amountCents 4290 e mostra a dica de parcelas', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    const name = screen.getByRole('textbox', { name: 'Nome' });
    expect(screen.getByRole('checkbox', { name: 'Mensal' })).toBeInTheDocument();
    fireEvent.change(name, { target: { value: 'Fone 1/7' } });
    expect(screen.getByText('Cria parcelas 1 a 7, uma por mês')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Mensal' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Vencimento')).toHaveValue('2026-12-05');

    const amount = screen.getByRole('textbox', { name: 'Valor' });
    fireEvent.change(amount, { target: { value: '42,90' } });
    fireEvent.keyDown(amount, { key: 'Enter' });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/entries' });
    expect(calls[0]!.body).toEqual({
      kind: 'EXPENSE',
      name: 'Fone 1/7',
      amountCents: 4290,
      dueDate: '2026-12-05',
      paymentMethodId: 'm-pix',
    });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue(''));
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveFocus();
  });

  test('chave Pix só aparece com método Pix e vai no POST', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Método' })).toHaveValue('m-pix'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Método' }), { target: { value: 'm-card' } });
    expect(screen.queryByRole('textbox', { name: 'Chave Pix' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Método' }), { target: { value: 'm-pix' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Aluguel' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor' }), { target: { value: '1.500' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Chave Pix' }), { target: { value: 'chave@exemplo.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mensal' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Chave Pix' }), { key: 'Enter' });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({
      kind: 'EXPENSE',
      name: 'Aluguel',
      amountCents: 150000,
      dueDate: '2026-12-05',
      paymentMethodId: 'm-pix',
      pixKey: 'chave@exemplo.com',
      monthly: true,
    });
  });

  test('editar valor de parcela abre ScopeDialog; "Esta e as próximas" envia scope "following"', async () => {
    entries = [installment()];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar valor: Fone 3/7' }));
    const input = screen.getByRole('textbox', { name: 'Valor: Fone 3/7' });
    expect(input).toHaveValue('42,90');
    fireEvent.change(input, { target: { value: '50,00' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Só esta' })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Esta e as próximas' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { scope: 'following', amountCents: 5000 } });
  });

  test('Esc cancela a edição e valor igual não envia nada', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar nome: Aluguel' }));
    let input = screen.getByRole('textbox', { name: 'Nome: Aluguel' });
    fireEvent.change(input, { target: { value: 'Aluguel novo' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Nome: Aluguel' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar nome: Aluguel' }));
    input = screen.getByRole('textbox', { name: 'Nome: Aluguel' });
    fireEvent.blur(input);
    expect(calls).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Editar nome: Aluguel' }));
    input = screen.getByRole('textbox', { name: 'Nome: Aluguel' });
    fireEvent.change(input, { target: { value: 'Aluguel novo' } });
    fireEvent.blur(input);
    // Lançamento avulso: salva direto, sem ScopeDialog.
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { name: 'Aluguel novo' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('edição inline sobrevive a re-render da página (ex.: refetch, busca)', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar valor: Aluguel' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor: Aluguel' }), { target: { value: '1.600' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nome' }), { target: { value: 'Alu' } });

    expect(screen.getByRole('textbox', { name: 'Valor: Aluguel' })).toHaveValue('1.600');
  });

  test('marcar pago remove a linha e "Desfazer" envia paid:false e a linha volta', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    let release!: () => void;
    payGate = new Promise((resolve) => (release = resolve));
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Pago: Aluguel' }));

    // Otimista: some antes de a API responder.
    await waitFor(() => expect(screen.queryByText('Aluguel')).not.toBeInTheDocument());
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/entries/e1/pay', body: { paid: true } });
    payGate = null;
    release();

    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ method: 'POST', path: '/api/entries/e1/pay', body: { paid: false } });
    expect(await screen.findByText('Aluguel')).toBeInTheDocument();
  });

  test('pago com erro da API devolve a linha e mostra a mensagem', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    writeResponse = { status: 404, body: { error: 'not_found' } };
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Pago: Aluguel' }));

    expect(await screen.findByText('Lançamento não encontrado. Ele pode ter sido excluído.')).toBeInTheDocument();
    expect(screen.getByText('Aluguel')).toBeInTheDocument();
  });

  test('Copiar chave chama clipboard.writeText com a pixKey', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    entries = [
      entry({
        id: 'e1',
        displayName: 'Diarista',
        amountCents: 20000,
        dueDate: '2026-12-05',
        paymentMethodId: 'm-pix',
        pixKey: 'chave@exemplo.com',
      }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar chave' }));

    expect(writeText).toHaveBeenCalledWith('chave@exemplo.com');
    expect(await screen.findByText('Copiada!')).toBeInTheDocument();
  });

  test('offline: Nova linha, checkbox Pago e edição ficam desabilitados', async () => {
    online = false;
    entries = [installment({ pixKey: 'chave@exemplo.com', paymentMethodId: 'm-pix' })];
    renderPage();

    expect(await screen.findByRole('checkbox', { name: 'Pago: Fone 3/7' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Nova linha' })).toBeDisabled();
    for (const field of ['nome', 'valor', 'data', 'método']) {
      expect(screen.getByRole('button', { name: `Editar ${field}: Fone 3/7` })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Excluir: Fone 3/7' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar: Fone 3/7' })).toBeDisabled();
  });

  test('offline no celular: Pago, Editar e Nova linha desabilitados', async () => {
    online = false;
    setViewport(false);
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    expect(await screen.findByRole('checkbox', { name: 'Pago: Aluguel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar: Aluguel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Nova linha' })).toBeDisabled();
  });

  test('excluir lançamento já pago pede confirmação explícita antes do DELETE', async () => {
    entries = [entry({ id: 'paid1', displayName: 'Luz', amountCents: 15000, dueDate: '2026-12-05', paidOn: '2026-11-28' })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir: Luz' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Este lançamento já foi pago. Excluir mesmo assim?')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/api/entries/paid1?scope=this' });
  });

  test('excluir parcela oferece Só esta / Esta e as próximas / Série inteira', async () => {
    entries = [installment()];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir: Fone 3/7' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Só esta' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Esta e as próximas' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Série inteira' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/api/entries/e1?scope=series' });
  });

  test('erro da API ao editar aparece em mensagem amigável', async () => {
    entries = [installment()];
    writeResponse = { status: 400, body: { error: 'total_below_paid_installment' } };
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar nome: Fone 3/7' }));
    const input = screen.getByRole('textbox', { name: 'Nome: Fone 3/7' });
    fireEvent.change(input, { target: { value: 'Fone 3/5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Esta e as próximas' }));

    expect(
      await screen.findByText('O total de parcelas não pode ser menor que a última parcela paga.'),
    ).toBeInTheDocument();
    expect(calls[0]!.body).toEqual({ scope: 'following', name: 'Fone 3/5' });
  });

  test('Encerrar série mensal envia o último mês escolhido', async () => {
    entries = [
      entry({
        id: 'm1',
        displayName: 'Internet',
        amountCents: 9990,
        dueDate: '2026-12-10',
        seriesId: 's9',
        seriesType: 'MONTHLY',
        sequence: 4,
      }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar série: Internet' }));
    const dialog = await screen.findByRole('dialog');
    const month = within(dialog).getByLabelText('Último mês');
    expect(month).toHaveValue('2026-12');
    fireEvent.change(month, { target: { value: '2027-02' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encerrar série' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/series/s9/end', body: { lastMonth: '2027-02' } });
  });

  test('celular: checkbox Pago funciona e Editar abre formulário que salva', async () => {
    setViewport(false);
    entries = [
      entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' }),
      entry({ id: 'e2', displayName: 'Café', amountCents: 700, dueDate: '2026-12-09' }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Pago: Café' }));
    await waitFor(() => expect(screen.queryByText('Café')).not.toBeInTheDocument());
    expect(calls[0]).toEqual({ method: 'POST', path: '/api/entries/e2/pay', body: { paid: true } });

    fireEvent.click(screen.getByRole('button', { name: 'Editar: Aluguel' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Valor' }), { target: { value: '1.600,00' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { amountCents: 160000 } });
  });
});

describe('UndoToast', () => {
  test('some sozinho depois de 5 s', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<UndoToast message="“Aluguel” marcado como pago" onUndo={() => {}} onClose={onClose} />);
      vi.advanceTimersByTime(4999);
      expect(onClose).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
