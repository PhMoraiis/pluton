import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PaymentMethodDTO, SalaryDTO } from '@pluton/shared';

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

const MAX_CENTS = 2_147_483_647;
const CURRENT = '2026-11';

let salary: SalaryDTO | null;
let methods: PaymentMethodDTO[];
let calls: Array<{ method: string; path: string; search: string; body: Record<string, unknown> | null }>;
let online: boolean;
let putError: string | null;

/** Mesmas regras do zod de `routes/salary.ts` e do serviço (Task 6). */
function putBodyError(b: Record<string, unknown> | null): string | null {
  if (!b) return 'invalid_body';
  const { amountCents: a, dayOfMonth: d, startMonth: s, paymentMethodId: p } = b;
  if (!(typeof a === 'number' && Number.isInteger(a) && a > 0 && a <= MAX_CENTS)) return 'invalid_body';
  if (!(typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 31)) return 'invalid_body';
  if (!(typeof s === 'string' && /^\d{4}-\d{2}$/.test(s))) return 'invalid_body';
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5));
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return 'invalid_body';
  if (!(p === null || typeof p === 'string')) return 'invalid_body';
  if (typeof p === 'string' && !methods.some((m) => m.id === p)) return 'invalid_payment_method';
  // `startMonth` só vale na criação.
  if (!salary && s < CURRENT) return 'start_month_in_past';
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
      if (url.pathname === '/api/payment-methods') return json(methods);
      if (url.pathname === '/api/tags') return json([]);
      if (url.pathname === '/api/salary') {
        if (method === 'GET') return json(salary);
        if (method === 'PUT') {
          const err = putError ?? putBodyError(body);
          if (err) return json({ error: err }, 400);
          salary = {
            seriesId: salary?.seriesId ?? 's1',
            amountCents: body!['amountCents'] as number,
            dayOfMonth: body!['dayOfMonth'] as number,
            paymentMethodId: body!['paymentMethodId'] as string | null,
            startMonth: salary?.startMonth ?? (body!['startMonth'] as string),
          };
          return json(salary);
        }
        if (method === 'DELETE') {
          const last = url.searchParams.get('lastMonth');
          if (!last || !/^\d{4}-\d{2}$/.test(last)) return json({ error: 'invalid_query' }, 400);
          if (!salary) return json({ error: 'not_found' }, 404);
          salary = null;
          return new Response(null, { status: 204 });
        }
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

const section = () => screen.getByRole('region', { name: 'Salário' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'));
  salary = null;
  putError = null;
  methods = [{ id: 'm-pix', name: 'Pix', color: '#0B6E99', sortOrder: 0 }];
  calls = [];
  online = true;
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
  mockFetch();
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SettingsPage – Salário', () => {
  test('a seção Salário fica antes de Métodos de pagamento', async () => {
    renderSettings();
    await screen.findByLabelText('Valor estimado');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Salário');
    expect(headings.indexOf('Salário')).toBeLessThan(headings.indexOf('Métodos de pagamento'));
  });

  test('sem salário: salvar envia PUT com dia 31, mês atual e sem método', async () => {
    renderSettings();
    const amount = await screen.findByLabelText('Valor estimado');
    expect(screen.getByLabelText('Dia do pagamento')).toHaveValue('31');
    expect(screen.getByLabelText('Mês de início')).toHaveValue(CURRENT);
    expect(screen.getByLabelText('Mês de início')).toHaveAttribute('min', CURRENT);
    expect(screen.getByLabelText('Mês de início')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Desativar salário' })).not.toBeInTheDocument();
    fireEvent.change(amount, { target: { value: '5.000,00' } });
    fireEvent.blur(amount);
    expect(screen.getByRole('option', { name: 'Último dia do mês' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar salário' }));
    expect(await within(section()).findByRole('status')).toHaveTextContent('Salário salvo.');
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      amountCents: 500000,
      dayOfMonth: 31,
      startMonth: CURRENT,
      paymentMethodId: null,
    });
  });

  test('mês de início no passado na criação não é enviado (validação nativa do min)', async () => {
    renderSettings();
    const amount = await screen.findByLabelText('Valor estimado');
    fireEvent.change(amount, { target: { value: '100,00' } });
    fireEvent.change(screen.getByLabelText('Mês de início'), { target: { value: '2026-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar salário' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  test('com salário: campos preenchidos, mês de início desabilitado; editar envia PUT com o startMonth existente', async () => {
    // O mês de início guardado já passou: ainda assim a atualização deve ser aceita.
    salary = { seriesId: 's1', amountCents: 450000, dayOfMonth: 5, paymentMethodId: 'm-pix', startMonth: '2026-08' };
    renderSettings();
    const amount = await screen.findByLabelText('Valor estimado');
    await waitFor(() => expect(amount).toHaveValue('4.500,00'));
    expect(screen.getByLabelText('Dia do pagamento')).toHaveValue('5');
    expect(screen.getByLabelText('Método de recebimento')).toHaveValue('m-pix');
    expect(screen.getByLabelText('Mês de início')).toHaveValue('2026-08');
    expect(screen.getByLabelText('Mês de início')).toBeDisabled();
    fireEvent.change(amount, { target: { value: '4.800,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar salário' }));
    expect(await within(section()).findByRole('status')).toHaveTextContent('Salário salvo.');
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      amountCents: 480000,
      dayOfMonth: 5,
      startMonth: '2026-08',
      paymentMethodId: 'm-pix',
    });
  });

  test('Desativar salário abre modal e envia DELETE com lastMonth do mês atual', async () => {
    salary = { seriesId: 's1', amountCents: 450000, dayOfMonth: 5, paymentMethodId: null, startMonth: '2026-08' };
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar salário' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Último mês com salário')).toHaveValue(CURRENT);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.path + del.search).toBe(`/api/salary?lastMonth=${CURRENT}`);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desativar salário' })).not.toBeInTheDocument());
  });

  test('erro overlaps_previous_salary mostra mensagem amigável', async () => {
    putError = 'overlaps_previous_salary';
    renderSettings();
    const amount = await screen.findByLabelText('Valor estimado');
    fireEvent.change(amount, { target: { value: '100,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar salário' }));
    expect(await within(section()).findByRole('alert')).toHaveTextContent(
      'Já existe salário até esse mês. Escolha um mês de início posterior.',
    );
  });

  test('valor vazio ou inválido não envia', async () => {
    renderSettings();
    await screen.findByLabelText('Valor estimado');
    expect(screen.getByRole('button', { name: 'Salvar salário' })).toBeDisabled();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  test('offline: campos e botões ficam desabilitados', async () => {
    salary = { seriesId: 's1', amountCents: 450000, dayOfMonth: 5, paymentMethodId: null, startMonth: '2026-08' };
    renderSettings();
    await waitFor(() => expect(screen.getByLabelText('Valor estimado')).toHaveValue('4.500,00'));
    online = false;
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar salário' })).toBeDisabled());
    expect(screen.getByLabelText('Valor estimado')).toBeDisabled();
    expect(screen.getByLabelText('Dia do pagamento')).toBeDisabled();
    expect(screen.getByLabelText('Método de recebimento')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Desativar salário' })).toBeDisabled();
  });

  test('offline sem salário: mês de início também fica desabilitado', async () => {
    renderSettings();
    await screen.findByLabelText('Valor estimado');
    online = false;
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(screen.getByLabelText('Mês de início')).toBeDisabled());
  });
});
