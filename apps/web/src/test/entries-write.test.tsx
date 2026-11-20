import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { EntryDTO, PaymentMethodDTO, TagDTO } from '@pluton/shared';

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
  { id: 'm-pix', name: 'Pix', color: '#2eaadc', sortOrder: 0, chargeNextMonth: false },
  { id: 'm-card', name: 'Cartão de crédito', color: '#e255a1', sortOrder: 1, chargeNextMonth: true },
];

const tagList: TagDTO[] = [
  { id: 't-sub', name: 'Assinatura', color: '#D9730D', sortOrder: 0, system: 'SUBSCRIPTION' },
  { id: 't-casa', name: 'Casa', color: '#0B6E99', sortOrder: 1, system: null },
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
/** Métodos devolvidos pela API; `null` = a consulta falha (lista ainda não carregada). */
let methodList: PaymentMethodDTO[] | null;

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
      if (url.pathname.startsWith('/api/entries/') && method === 'PATCH') {
        // Mesmas regras de `tagIds` da API: array de strings não vazias, únicas, até 20.
        const patch = (body ?? {}) as { tagIds?: unknown; scope?: string };
        if (patch.tagIds !== undefined) {
          const ids = patch.tagIds;
          const valid =
            Array.isArray(ids) &&
            ids.length <= 20 &&
            ids.every((t) => typeof t === 'string' && t.length > 0) &&
            new Set(ids).size === ids.length;
          if (!valid) return json({ error: 'invalid_body' }, 400);
          if ((ids as string[]).some((t) => !tagList.some((x) => x.id === t))) return json({ error: 'invalid_tag' }, 400);
          const id = decodeURIComponent(url.pathname.split('/')[3]!);
          const current = entries.find((e) => e.id === id);
          const changed =
            !!current &&
            (current.tagIds.length !== ids.length || !(ids as string[]).every((t) => current.tagIds.includes(t)));
          if (current?.seriesId && changed && !patch.scope) return json({ error: 'scope_required' }, 400);
        }
        return json([]);
      }
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
          return json({ expenseCents: 0, expensePaidCents: 0, incomeCents: 0, incomePaidCents: 0, balanceCents: 0, realizedCents: 0 });
        case '/api/tags':
          return json(tagList);
        case '/api/payment-methods':
          return methodList ? json(methodList) : json({ error: 'internal' }, 500);
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
  methodList = methods;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
  mockFetch();
  setViewport(true);
});

afterEach(() => {
  cleanup();
  // O evento `offline` também desliga o onlineManager global do TanStack Query.
  onlineManager.setOnline(true);
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

  test('Encerrar série: mês em formato inválido mostra mensagem e não envia', async () => {
    entries = [
      entry({ id: 'm1', displayName: 'Internet', amountCents: 9990, dueDate: '2026-12-10', seriesId: 's9', seriesType: 'MONTHLY', sequence: 4 }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar série: Internet' }));
    const dialog = await screen.findByRole('dialog');
    const month = within(dialog).getByLabelText('Último mês');
    expect(month).toHaveAttribute('placeholder', 'AAAA-MM');
    expect(month).toHaveAttribute('pattern', '\\d{4}-(0[1-9]|1[0-2])');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(month, { target: { value: '12/2026' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Mês inválido. Use o formato AAAA-MM (ex.: 2027-02).');
    expect(within(dialog).getByRole('button', { name: 'Encerrar série' })).toBeDisabled();
    fireEvent.submit(month.closest('form')!);
    expect(calls).toHaveLength(0);
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

describe('EntriesPage (escrita) — segurança dos dados', () => {
  function goOffline() {
    online = false;
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
  }

  test('ficar offline com o ScopeDialog de edição aberto desabilita as opções e não envia nada', async () => {
    entries = [installment()];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar valor: Fone 3/7' }));
    const input = screen.getByRole('textbox', { name: 'Valor: Fone 3/7' });
    fireEvent.change(input, { target: { value: '50,00' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog');

    goOffline();

    for (const name of ['Só esta', 'Esta e as próximas']) {
      const option = within(dialog).getByRole('button', { name });
      expect(option).toBeDisabled();
      fireEvent.click(option);
    }
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    expect(calls).toHaveLength(0);
  });

  test('ficar offline com a exclusão aberta (série e confirmação de pago) não envia DELETE', async () => {
    entries = [
      installment(),
      entry({ id: 'paid1', displayName: 'Luz', amountCents: 15000, dueDate: '2026-12-05', paidOn: '2026-11-28' }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir: Fone 3/7' }));
    let dialog = await screen.findByRole('dialog');
    goOffline();
    for (const name of ['Só esta', 'Esta e as próximas', 'Série inteira']) {
      expect(within(dialog).getByRole('button', { name })).toBeDisabled();
      fireEvent.click(within(dialog).getByRole('button', { name }));
    }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    online = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir: Luz' }));
    dialog = await screen.findByRole('dialog');
    goOffline();
    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(calls).toHaveLength(0);
  });

  test('dois Enter seguidos na nova linha fazem um único POST', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Método' })).toHaveValue('m-pix'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Fone 1/7' } });
    const amount = screen.getByRole('textbox', { name: 'Valor' });
    fireEvent.change(amount, { target: { value: '42,90' } });
    fireEvent.keyDown(amount, { key: 'Enter' });
    fireEvent.keyDown(amount, { key: 'Enter' });

    await waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  test('dois envios seguidos do formulário no celular fazem um único POST', async () => {
    setViewport(false);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Nome' }), { target: { value: 'Fone 1/7' } });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Valor' }), { target: { value: '42,90' } });
    const save = within(sheet).getByRole('button', { name: 'Salvar' });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
  });

  test('trocar o método de Pix para outro na célula limpa a chave Pix (pixKey: null)', async () => {
    entries = [
      entry({ id: 'e1', displayName: 'Diarista', amountCents: 20000, dueDate: '2026-12-05', paymentMethodId: 'm-pix', pixKey: 'chave@exemplo.com' }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar método: Diarista' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Método: Diarista' }), { target: { value: 'm-card' } });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: 'PATCH',
      path: '/api/entries/e1',
      body: { paymentMethodId: 'm-card', pixKey: null },
    });
  });

  test('trocar o método de Pix para outro no formulário limpa a chave Pix', async () => {
    entries = [
      entry({ id: 'e1', displayName: 'Diarista', amountCents: 20000, dueDate: '2026-12-05', paymentMethodId: 'm-pix', pixKey: 'chave@exemplo.com' }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar: Diarista' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Método' }), { target: { value: 'm-card' } });
    expect(within(sheet).queryByRole('textbox', { name: 'Chave Pix' })).not.toBeInTheDocument();
    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Método' }), { target: { value: 'm-pix' } });
    expect(within(sheet).getByRole('textbox', { name: 'Chave Pix' })).toHaveValue('');
    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Método' }), { target: { value: 'm-card' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({ paymentMethodId: 'm-card', pixKey: null });
  });

  test('Pix renomeado ("PIX") + edição só do valor no formulário mantém a chave Pix', async () => {
    methodList = [{ ...methods[0]!, name: 'PIX' }, methods[1]!];
    entries = [
      entry({ id: 'e1', displayName: 'Diarista', amountCents: 20000, dueDate: '2026-12-05', paymentMethodId: 'm-pix', pixKey: 'chave@exemplo.com' }),
    ];
    renderPage();

    expect(await screen.findByRole('button', { name: 'Copiar chave' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar: Diarista' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    expect(within(sheet).getByRole('textbox', { name: 'Chave Pix' })).toHaveValue('chave@exemplo.com');
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Valor' }), { target: { value: '250,00' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { amountCents: 25000 } });
  });

  test('métodos não carregados + edição só do valor no formulário mantém a chave Pix', async () => {
    methodList = null;
    entries = [
      entry({ id: 'e1', displayName: 'Diarista', amountCents: 20000, dueDate: '2026-12-05', paymentMethodId: 'm-pix', pixKey: 'chave@exemplo.com' }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar: Diarista' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Valor' }), { target: { value: '250,00' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { amountCents: 25000 } });
  });

  test('campos de nome limitam a 120 caracteres e chave Pix a 140 (limites da API)', async () => {
    entries = [
      entry({ id: 'e1', displayName: 'Diarista', amountCents: 20000, dueDate: '2026-12-05', paymentMethodId: 'm-pix', pixKey: 'chave@exemplo.com' }),
    ];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Método' })).toHaveValue('m-pix'));
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveAttribute('maxLength', '120');
    expect(screen.getByRole('textbox', { name: 'Chave Pix' })).toHaveAttribute('maxLength', '140');

    fireEvent.click(screen.getByRole('button', { name: 'Editar nome: Diarista' }));
    expect(screen.getByRole('textbox', { name: 'Nome: Diarista' })).toHaveAttribute('maxLength', '120');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nome: Diarista' }), { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Editar: Diarista' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    expect(within(sheet).getByRole('textbox', { name: 'Nome' })).toHaveAttribute('maxLength', '120');
    expect(within(sheet).getByRole('textbox', { name: 'Chave Pix' })).toHaveAttribute('maxLength', '140');
  });

  test('Copiar chave só aparece quando o método é Pix', async () => {
    entries = [
      entry({ id: 'e1', displayName: 'Cartão', amountCents: 20000, dueDate: '2026-12-05', paymentMethodId: 'm-card', pixKey: 'antiga@exemplo.com' }),
      entry({ id: 'e2', displayName: 'Sem método', amountCents: 100, dueDate: '2026-12-06', pixKey: 'x@exemplo.com' }),
    ];
    renderPage();

    await screen.findByText('Cartão');
    expect(screen.queryByRole('button', { name: 'Copiar chave' })).not.toBeInTheDocument();
  });

  test('valor da nova linha ganha máscara BRL ao sair do campo', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Método' })).toHaveValue('m-pix'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Aluguel' } });
    const amount = screen.getByRole('textbox', { name: 'Valor' });
    fireEvent.change(amount, { target: { value: '1500' } });
    fireEvent.blur(amount);
    expect((amount as HTMLInputElement).value.replace(/\u00A0/g, ' ')).toBe('R$ 1.500,00');

    fireEvent.change(amount, { target: { value: 'abc' } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue('abc');

    fireEvent.change(amount, { target: { value: '7' } });
    fireEvent.blur(amount);
    fireEvent.keyDown(amount, { key: 'Enter' });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toMatchObject({ amountCents: 700 });
  });

  test('nova linha aceita "Sem método" (não volta para Pix)', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Método' })).toHaveValue('m-pix'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Método' }), { target: { value: '' } });
    expect(screen.getByRole('combobox', { name: 'Método' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), { target: { value: 'Feira' } });
    const amount = screen.getByRole('textbox', { name: 'Valor' });
    fireEvent.change(amount, { target: { value: '30' } });
    fireEvent.keyDown(amount, { key: 'Enter' });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toMatchObject({ name: 'Feira', paymentMethodId: null });
  });

  test('valor do formulário no celular ganha máscara BRL ao sair do campo', async () => {
    setViewport(false);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Nova linha' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' });
    const amount = within(sheet).getByRole('textbox', { name: 'Valor' });
    fireEvent.change(amount, { target: { value: '42,9' } });
    fireEvent.blur(amount);
    expect((amount as HTMLInputElement).value.replace(/\u00A0/g, ' ')).toBe('R$ 42,90');
  });
});

describe('EntriesPage (escrita) — etiquetas', () => {
  test('desktop, avulsa: marcar "Assinatura" e aplicar envia tagIds sem scope', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Etiquetas: Aluguel' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assinatura' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { tagIds: ['t-sub'] } });
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument();
  });

  test('série: aplicar etiquetas abre "Aplicar alteração" e "Esta e as próximas" envia scope following', async () => {
    entries = [installment()];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Etiquetas: Fone 3/7' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Casa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Aplicar alteração' });
    expect(calls).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Esta e as próximas' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { scope: 'following', tagIds: ['t-casa'] } });
  });

  test('aplicar sem mudar nada não envia', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05', tagIds: ['t-casa'] })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Etiquetas: Aluguel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  test('Esc fecha e aplica; foco volta ao botão', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    const trigger = await screen.findByRole('button', { name: 'Etiquetas: Aluguel' });
    fireEvent.click(trigger);
    const box = screen.getByRole('checkbox', { name: 'Assinatura' });
    await waitFor(() => expect(box).toHaveFocus());
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: 'Escape' });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({ tagIds: ['t-sub'] });
    expect(trigger).toHaveFocus();
  });

  test('clique fora fecha e aplica', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Etiquetas: Aluguel' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Casa' }));
    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({ tagIds: ['t-casa'] });
  });

  test('celular: marcar "Assinatura" no formulário e salvar envia tagIds', async () => {
    setViewport(false);
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar: Aluguel' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Assinatura' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: 'PATCH', path: '/api/entries/e1', body: { tagIds: ['t-sub'] } });
  });

  test('celular: salvar sem mexer nas etiquetas não envia tagIds', async () => {
    setViewport(false);
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05', tagIds: ['t-casa'] })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar: Aluguel' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    expect(within(sheet).getByRole('checkbox', { name: 'Casa' })).toBeChecked();
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Valor' }), { target: { value: '1.600,00' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({ amountCents: 160000 });
  });

  test('offline: botão de etiquetas desabilitado e painel não abre', async () => {
    online = false;
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    const trigger = await screen.findByRole('button', { name: 'Etiquetas: Aluguel' });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument();
  });
});

describe('EntriesPage (escrita) — etiquetas obsoletas e offline', () => {
  test('tabela: id de etiqueta excluída não vai no PATCH', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05', tagIds: ['t-gone', 't-casa'] })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Etiquetas: Aluguel' }));
    expect(screen.getByRole('checkbox', { name: 'Casa' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assinatura' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const sent = (calls[0]!.body as { tagIds: string[] }).tagIds;
    expect([...sent].sort()).toEqual(['t-casa', 't-sub']);
  });

  test('tabela: só o id obsoleto não conta como mudança', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05', tagIds: ['t-gone', 't-casa'] })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Etiquetas: Aluguel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(calls).toHaveLength(0);
  });

  test('formulário: id obsoleto não vai no PATCH', async () => {
    setViewport(false);
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05', tagIds: ['t-gone', 't-casa'] })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar: Aluguel' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'Assinatura' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect([...(calls[0]!.body as { tagIds: string[] }).tagIds].sort()).toEqual(['t-casa', 't-sub']);
  });

  test('ficar offline com o painel aberto fecha sem aplicar; Esc depois não envia', async () => {
    entries = [entry({ id: 'e1', displayName: 'Aluguel', amountCents: 150000, dueDate: '2026-12-05' })];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Etiquetas: Aluguel' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assinatura' }));
    online = false;
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.mouseDown(document.body);
    expect(calls).toHaveLength(0);
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
