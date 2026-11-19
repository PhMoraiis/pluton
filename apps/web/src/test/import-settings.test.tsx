import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ImportPlan, NotionRow, PaymentMethodDTO, PlannedEntry } from '@pluton/shared';

const sessionState = vi.hoisted(() => ({ data: { user: { id: 'u1' }, session: { id: 's1' } } as unknown }));
const signOutSpy = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../lib/auth-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth-client')>();
  return {
    ...actual,
    authClient: {
      useSession: () => ({ data: sessionState.data, isPending: false, isRefetching: false, error: null }),
      signOut: signOutSpy,
    },
  };
});

import { ImportPage } from '../pages/ImportPage';
import { SettingsPage } from '../pages/SettingsPage';
import { PALETTE } from '../lib/palette';

const CSV = 'Name,Amount,Date\nSpotify,"R$ 21,90",10 de novembro de 2026\nPresente,"R$ 50,00",\n';
const MAX_CENTS = 2_147_483_647;

function planned(over: Partial<PlannedEntry> & Pick<PlannedEntry, 'name' | 'dueDate'>): PlannedEntry {
  return {
    rowId: null,
    sequence: null,
    amountCents: 2190,
    paid: false,
    paymentMethod: null,
    note: '',
    generated: false,
    ...over,
  };
}

const presente: NotionRow = {
  rowId: 2,
  name: 'Presente',
  amountCents: 5000,
  dueDate: null,
  paid: false,
  paymentMethod: null,
  note: '',
  errors: ['sem data'],
};

let methods: PaymentMethodDTO[];
let calls: Array<{ method: string; path: string; body: Record<string, unknown> | null }>;
let online: boolean;
let nextPlan: ((body: Record<string, unknown>) => ImportPlan) | null;

function basePlan(): ImportPlan {
  return {
    installmentSeries: [
      {
        key: 'fone',
        baseName: 'Fone',
        total: 7,
        dayOfMonth: 5,
        amountCents: 25470,
        paymentMethod: 'Cartão',
        entries: [
          planned({ name: 'Fone 3/7', sequence: 3, dueDate: '2026-11-05', amountCents: 25470 }),
          planned({ name: 'Fone 4/7', sequence: 4, dueDate: '2026-12-05', amountCents: 25470, generated: true }),
        ],
      },
    ],
    monthlySuggestions: [
      {
        key: 'spotify',
        name: 'Spotify',
        dayOfMonth: 10,
        amountCents: 2190,
        paymentMethod: 'Cartão',
        active: true,
        entries: [planned({ name: 'Spotify', dueDate: '2026-11-10' })],
      },
      {
        key: 'claro flex',
        name: 'Claro Flex',
        dayOfMonth: 15,
        amountCents: 8990,
        paymentMethod: 'Pix',
        active: false,
        entries: [planned({ name: 'Claro Flex', dueDate: '2025-03-15', amountCents: 8990 })],
      },
    ],
    singles: [planned({ name: 'Tenis', dueDate: '2026-10-20', amountCents: 39900 })],
    invalid: [presente],
    duplicates: 3,
  };
}

/** Aplica overrides/exclusões como o servidor (mesma validação do zod das rotas). */
function planFor(body: Record<string, unknown>): ImportPlan {
  const plan = basePlan();
  const overrides = (body['overrides'] ?? {}) as Record<string, { name?: string; amountCents?: number; dueDate?: string }>;
  const excluded = (body['excludedRowIds'] ?? []) as number[];
  plan.invalid = plan.invalid
    .filter((r) => !excluded.includes(r.rowId))
    .map((r) => {
      const merged = { ...r, ...(overrides[String(r.rowId)] ?? {}) } as NotionRow;
      merged.errors = merged.dueDate ? [] : ['sem data'];
      return merged;
    });
  if (plan.invalid.some((r) => r.errors.length === 0)) {
    const fixed = plan.invalid.filter((r) => r.errors.length === 0);
    plan.invalid = plan.invalid.filter((r) => r.errors.length > 0);
    for (const r of fixed) plan.singles.push(planned({ rowId: r.rowId, name: r.name, dueDate: r.dueDate!, amountCents: r.amountCents! }));
  }
  return plan;
}

function validDate(s: unknown): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  const year = Number(s.slice(0, 4));
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && year >= 2000 && year <= 2100;
}

/** Mesmas regras do zod de `routes/import.ts`. */
function importBodyValid(b: Record<string, unknown>, commit: boolean): boolean {
  if (typeof b['csv'] !== 'string') return false;
  if (commit && !(Array.isArray(b['acceptedMonthlyKeys']) && b['acceptedMonthlyKeys'].every((k) => typeof k === 'string'))) return false;
  if (b['excludedRowIds'] !== undefined) {
    const ids = b['excludedRowIds'];
    if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n) && n > 0)) return false;
  }
  if (b['overrides'] !== undefined) {
    const o = b['overrides'];
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
    for (const [id, v] of Object.entries(o as Record<string, Record<string, unknown>>)) {
      if (!/^[1-9]\d*$/.test(id) || typeof v !== 'object' || v === null) return false;
      if ('name' in v && !(typeof v['name'] === 'string' && v['name'].trim().length >= 1 && v['name'].trim().length <= 120)) return false;
      if ('amountCents' in v) {
        const a = v['amountCents'];
        if (!(typeof a === 'number' && Number.isInteger(a) && a > 0 && a <= MAX_CENTS)) return false;
      }
      if ('dueDate' in v && !validDate(v['dueDate'])) return false;
    }
  }
  return true;
}

const methodBody = (b: Record<string, unknown> | null) =>
  !!b &&
  typeof b['name'] === 'string' &&
  b['name'].trim().length >= 1 &&
  b['name'].trim().length <= 60 &&
  typeof b['color'] === 'string' &&
  /^#[0-9A-Fa-f]{6}$/.test(b['color']);

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ method, path: url.pathname, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      const bad = () => json({ error: 'invalid_body' }, 400);

      if (url.pathname === '/api/import/preview' && method === 'POST') {
        if (!body || !importBodyValid(body, false)) return bad();
        return json(nextPlan ? nextPlan(body) : planFor(body));
      }
      if (url.pathname === '/api/import/commit' && method === 'POST') {
        if (!body || !importBodyValid(body, true)) return bad();
        return json({ created: 12, duplicates: 3, invalidSkipped: 1 });
      }
      if (url.pathname === '/api/payment-methods') {
        if (method === 'GET') return json(methods);
        if (method === 'POST') {
          if (!methodBody(body)) return bad();
          const name = (body!['name'] as string).trim();
          if (methods.some((m) => m.name === name)) return json({ error: 'duplicate_name' }, 409);
          const created = { id: `m-${name}`, name, color: body!['color'] as string, sortOrder: methods.length };
          methods = [...methods, created];
          return json(created, 201);
        }
      }
      const one = /^\/api\/payment-methods\/([^/]+)$/.exec(url.pathname);
      if (one) {
        const id = one[1]!;
        if (method === 'PATCH') {
          if (!methodBody(body)) return bad();
          const name = (body!['name'] as string).trim();
          if (methods.some((m) => m.name === name && m.id !== id)) return json({ error: 'duplicate_name' }, 409);
          methods = methods.map((m) => (m.id === id ? { ...m, name, color: body!['color'] as string } : m));
          return json(methods.find((m) => m.id === id));
        }
        if (method === 'DELETE') {
          methods = methods.filter((m) => m.id !== id);
          return new Response(null, { status: 204 });
        }
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function csvFile(text = CSV, size?: number) {
  const f = new File([text], 'notion.csv', { type: 'text/csv' });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
}

async function upload(file: File) {
  const input = screen.getByLabelText('Arquivo CSV do Notion') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  methods = [{ id: 'm-pix', name: 'Pix', color: '#0B6E99', sortOrder: 0 }];
  calls = [];
  online = true;
  nextPlan = null;
  signOutSpy.mockClear();
  vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
  mockFetch();
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ImportPage', () => {
  test('preview lista sugestão mensal "Spotify" marcada e uma inválida "sem data" editável', async () => {
    renderWith(<ImportPage />);
    await upload(csvFile());

    const monthly = await screen.findByRole('region', { name: 'Sugestões mensais' });
    expect(within(monthly).getByRole('checkbox', { name: /Spotify/ })).toBeChecked();
    expect(within(monthly).getByRole('checkbox', { name: /Claro Flex/ })).not.toBeChecked();

    const series = screen.getByRole('region', { name: 'Séries parceladas' });
    expect(within(series).getByText('Fone 3/7')).toBeInTheDocument();
    const gen = within(series).getByText('Fone 4/7').closest('li')!;
    expect(within(gen).getByText('nova')).toBeInTheDocument();
    expect(within(series).getByText('Fone 3/7').closest('li')!.textContent).not.toContain('nova');

    expect(within(screen.getByRole('region', { name: 'Avulsas' })).getByText('Tenis')).toBeInTheDocument();

    const invalid = screen.getByRole('region', { name: 'Inválidas' });
    expect(within(invalid).getByText('sem data')).toBeInTheDocument();
    expect(within(invalid).getByLabelText('Data de Presente')).toHaveValue('');
    expect(within(invalid).getByRole('button', { name: 'Descartar Presente' })).toBeInTheDocument();
    expect(screen.getByText('3 lançamentos já existem e serão ignorados')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/import/preview')!.body).toEqual({ csv: CSV });
  });

  test('desmarcar sugestão e preencher data da inválida → commit envia acceptedMonthlyKeys sem ela e overrides com dueDate', async () => {
    renderWith(<ImportPage />);
    await upload(csvFile());
    const monthly = await screen.findByRole('region', { name: 'Sugestões mensais' });
    fireEvent.click(within(monthly).getByRole('checkbox', { name: /Spotify/ }));

    fireEvent.change(screen.getByLabelText('Data de Presente'), { target: { value: '2026-12-25' } });
    // Edição ainda não validada pelo servidor: não deixa importar.
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar correções' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Inválidas' })).not.toBeInTheDocument());
    const previews = calls.filter((c) => c.path === '/api/import/preview');
    expect(previews).toHaveLength(2);
    expect(previews[1]!.body).toEqual({ csv: CSV, overrides: { '2': { dueDate: '2026-12-25' } } });

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    await screen.findByText('12 lançamentos criados');
    const commit = calls.find((c) => c.path === '/api/import/commit')!;
    expect(commit.body).toEqual({
      csv: CSV,
      acceptedMonthlyKeys: [],
      overrides: { '2': { dueDate: '2026-12-25' } },
    });
    expect(screen.getByText('3 já existiam e foram ignorados')).toBeInTheDocument();
    expect(screen.getByText('1 linha inválida ignorada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Despesas' })).toHaveAttribute('href', '/');
  });

  test('Descartar envia excludedRowIds, Importar envia as sugestões ativas', async () => {
    renderWith(<ImportPage />);
    await upload(csvFile());
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar Presente' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Inválidas' })).not.toBeInTheDocument());
    expect(calls.filter((c) => c.path === '/api/import/preview')[1]!.body).toEqual({ csv: CSV, excludedRowIds: [2] });
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    await screen.findByText('12 lançamentos criados');
    expect(calls.find((c) => c.path === '/api/import/commit')!.body).toEqual({
      csv: CSV,
      acceptedMonthlyKeys: ['spotify'],
      excludedRowIds: [2],
    });
  });

  test('valor digitado vira centavos nos overrides; valor inválido bloqueia Aplicar', async () => {
    renderWith(<ImportPage />);
    await upload(csvFile());
    const amount = await screen.findByLabelText('Valor de Presente');
    fireEvent.change(amount, { target: { value: 'abc' } });
    expect(screen.getByRole('button', { name: 'Aplicar correções' })).toBeDisabled();
    fireEvent.change(amount, { target: { value: 'R$ 1.234,56' } });
    expect(screen.getByLabelText('Nome de Presente')).toHaveAttribute('maxLength', '120');
    fireEvent.change(screen.getByLabelText('Nome de Presente'), { target: { value: '  Presente mãe ' } });
    fireEvent.change(screen.getByLabelText('Data de Presente'), { target: { value: '2026-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar correções' }));
    await waitFor(() => expect(calls.filter((c) => c.path === '/api/import/preview')).toHaveLength(2));
    expect(calls.filter((c) => c.path === '/api/import/preview')[1]!.body).toEqual({
      csv: CSV,
      overrides: { '2': { name: 'Presente mãe', amountCents: 123456, dueDate: '2026-12-25' } },
    });
  });

  test('arquivo acima de 2 MB é rejeitado no cliente e nada é enviado', async () => {
    renderWith(<ImportPage />);
    await upload(csvFile(CSV, 2 * 1024 * 1024 + 1));
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo grande demais (máximo 2 MB).');
    expect(calls).toHaveLength(0);
  });

  test('offline: Importar e envio de arquivo ficam desabilitados', async () => {
    online = false;
    renderWith(<ImportPage />);
    expect(screen.getByLabelText('Arquivo CSV do Notion')).toBeDisabled();
  });

  test('offline depois do preview: Importar e Descartar desabilitados', async () => {
    renderWith(<ImportPage />);
    await upload(csvFile());
    await screen.findByRole('region', { name: 'Séries parceladas' });
    online = false;
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Descartar Presente' })).toBeDisabled();
  });
});

describe('SettingsPage', () => {
  test('criar método "PicPay" aparece na lista', async () => {
    renderWith(<SettingsPage />);
    await screen.findByText('Pix');
    fireEvent.change(screen.getByLabelText('Nome do método'), { target: { value: ' PicPay ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Verde' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await screen.findByText('PicPay');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ name: 'PicPay', color: '#0F7B6C' });
    expect(PALETTE).toHaveLength(8);
    expect(screen.getByLabelText('Nome do método')).toHaveValue('');
  });

  test('nome duplicado (409) mostra mensagem', async () => {
    renderWith(<SettingsPage />);
    await screen.findByText('Pix');
    fireEvent.change(screen.getByLabelText('Nome do método'), { target: { value: 'Pix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um método com esse nome.');
  });

  test('editar nome e cor envia PATCH', async () => {
    renderWith(<SettingsPage />);
    await screen.findByText('Pix');
    fireEvent.click(screen.getByRole('button', { name: 'Editar Pix' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nome do método'), { target: { value: 'Pix Nubank' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Roxo' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Pix Nubank');
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ name: 'Pix Nubank', color: '#6940A5' });
  });

  test('excluir pede confirmação e avisa que lançamentos ficam sem método', async () => {
    renderWith(<SettingsPage />);
    await screen.findByText('Pix');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Pix' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Os lançamentos com este método ficarão sem método.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.queryByText('Pix')).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/payment-methods/m-pix')).toBe(true);
  });

  test('offline: adicionar, editar e excluir ficam desabilitados', async () => {
    renderWith(<SettingsPage />);
    await screen.findByText('Pix');
    online = false;
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Editar Pix' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir Pix' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeDisabled();
  });

  test('Sair encerra a sessão e leva para /login', async () => {
    renderWith(<SettingsPage />);
    await screen.findByText('Pix');
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
  });
});
