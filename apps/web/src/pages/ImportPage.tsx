import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatBRL, parseBRL, type ImportPlan, type NotionRow, type PlannedEntry } from '@pluton/shared';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { apiFetch } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { useCanWrite } from '../lib/online';

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CENTS = 2_147_483_647;

interface Override {
  name?: string;
  amountCents?: number;
  dueDate?: string;
}
type Overrides = Record<string, Override>;

interface CommitResult {
  created: number;
  duplicates: number;
  invalidSkipped: number;
}

interface RowDraft {
  name: string;
  amount: string;
  date: string;
}

const btn =
  'rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';
const input =
  'rounded-md border border-line bg-transparent px-2 py-1 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Mesma regra de `dueDateSchema` da API: data real entre 2000 e 2100. */
function isValidDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2100) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function amountText(row: NotionRow): string {
  return row.amountCents === null ? '' : (row.amountCents / 100).toFixed(2).replace('.', ',');
}

function baseDraft(row: NotionRow): RowDraft {
  return { name: row.name, amount: amountText(row), date: row.dueDate ?? '' };
}

function amountOk(text: string): boolean {
  if (text.trim() === '') return true;
  const cents = parseBRL(text);
  return cents !== null && cents > 0 && cents <= MAX_CENTS;
}

function draftOverride(row: NotionRow, d: RowDraft): Override {
  const o: Override = {};
  if (d.name.trim() && d.name.trim() !== row.name) o.name = d.name.trim();
  if (d.amount.trim()) {
    const cents = parseBRL(d.amount);
    if (cents !== null && cents !== row.amountCents) o.amountCents = cents;
  }
  if (d.date && d.date !== row.dueDate) o.dueDate = d.date;
  return o;
}

function Entries({ items }: { items: PlannedEntry[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((e, i) => (
        <li key={`${e.rowId ?? 'g'}-${e.name}-${e.dueDate}-${i}`} className="flex items-center gap-2 text-sm text-ink">
          <span className="min-w-0 flex-1 truncate">{e.name}</span>
          {e.generated && (
            <span className="rounded bg-hover px-1.5 py-0.5 text-xs font-medium text-muted">nova</span>
          )}
          <span className="tabular-nums text-muted">{e.dueDate}</span>
          <span className="tabular-nums">{formatBRL(e.amountCents)}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <h2 className="text-base font-semibold text-ink">
        {title} <span className="text-sm font-normal text-muted">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function InvalidRow({
  row,
  draft,
  canWrite,
  onChange,
  onDiscard,
}: {
  row: NotionRow;
  draft: RowDraft;
  canWrite: boolean;
  onChange: (d: RowDraft) => void;
  onDiscard: () => void;
}) {
  const label = row.name || `linha ${row.rowId}`;
  const badAmount = !amountOk(draft.amount);
  const badDate = draft.date !== '' && !isValidDueDate(draft.date);
  return (
    <li className="flex flex-col gap-2 rounded-md border border-line p-2">
      <div className="flex flex-wrap gap-1 text-xs text-muted">
        <span>Linha {row.rowId}:</span>
        {row.errors.map((e) => (
          <span key={e} className="rounded bg-hover px-1.5 py-0.5">
            {e}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Nome
          <input
            aria-label={`Nome de ${label}`}
            value={draft.name}
            disabled={!canWrite}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Valor
          <input
            aria-label={`Valor de ${label}`}
            value={draft.amount}
            inputMode="decimal"
            aria-invalid={badAmount}
            disabled={!canWrite}
            onChange={(e) => onChange({ ...draft, amount: e.target.value })}
            className={`${input} w-28`}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          Data
          <input
            aria-label={`Data de ${label}`}
            type="date"
            value={draft.date}
            aria-invalid={badDate}
            disabled={!canWrite}
            onChange={(e) => onChange({ ...draft, date: e.target.value })}
            className={input}
          />
        </label>
        <button type="button" className={btn} disabled={!canWrite} aria-label={`Descartar ${label}`} onClick={onDiscard}>
          Descartar
        </button>
      </div>
      {(badAmount || badDate) && (
        <p className="text-xs text-red-400">{badAmount ? 'Valor inválido.' : 'Data inválida.'}</p>
      )}
    </li>
  );
}

export function ImportPage() {
  const canWrite = useCanWrite();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [excluded, setExcluded] = useState<number[]>([]);
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  function body(c: string, o: Overrides, x: number[]) {
    return {
      csv: c,
      ...(Object.keys(o).length > 0 ? { overrides: o } : {}),
      ...(x.length > 0 ? { excludedRowIds: x } : {}),
    };
  }

  const preview = useMutation({
    mutationFn: (v: { csv: string; overrides: Overrides; excluded: number[] }) =>
      apiFetch<ImportPlan>('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify(body(v.csv, v.overrides, v.excluded)),
      }),
  });

  const commit = useMutation({
    mutationFn: (v: { csv: string; keys: string[]; overrides: Overrides; excluded: number[] }) =>
      apiFetch<CommitResult>('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({ ...body(v.csv, v.overrides, v.excluded), acceptedMonthlyKeys: v.keys }),
      }),
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all(
        [['entries'], ['overdue'], ['default-month'], ['summary'], ['payment-methods']].map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  function runPreview(c: string, o: Overrides, x: number[]) {
    preview.mutate({ csv: c, overrides: o, excluded: x }, { onSuccess: setPlan });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    setResult(null);
    commit.reset();
    if (file.size > MAX_CSV_BYTES) {
      setFileError('Arquivo grande demais (máximo 2 MB).');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileError('Não foi possível ler o arquivo.');
      return;
    }
    setCsv(text);
    setOverrides({});
    setExcluded([]);
    setChoices({});
    setDrafts({});
    setPlan(null);
    runPreview(text, {}, []);
  }

  const invalidRows = plan?.invalid ?? [];
  const draftOf = (row: NotionRow) => drafts[row.rowId] ?? baseDraft(row);
  const dirtyRows = invalidRows.filter((r) => Object.keys(draftOverride(r, draftOf(r))).length > 0);
  const hasBadDraft = invalidRows.some((r) => {
    const d = draftOf(r);
    return !amountOk(d.amount) || (d.date !== '' && !isValidDueDate(d.date));
  });
  const busy = preview.isPending || commit.isPending;

  function apply() {
    if (!csv) return;
    const next: Overrides = { ...overrides };
    for (const r of dirtyRows) {
      next[String(r.rowId)] = { ...next[String(r.rowId)], ...draftOverride(r, draftOf(r)) };
    }
    setOverrides(next);
    runPreview(csv, next, excluded);
  }

  function discard(rowId: number) {
    if (!csv) return;
    const next = [...excluded, rowId];
    setExcluded(next);
    runPreview(csv, overrides, next);
  }

  function doCommit() {
    if (!csv || !plan) return;
    const keys = plan.monthlySuggestions.filter((s) => choices[s.key] ?? s.active).map((s) => s.key);
    commit.mutate({ csv, keys, overrides, excluded });
  }

  const error = fileError ?? (preview.isError ? friendlyError(preview.error) : null) ?? (commit.isError ? friendlyError(commit.error) : null);

  return (
    <section aria-label="Importar" className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-ink">Importar</h1>
      <p className="text-sm text-muted">Envie o CSV exportado do Notion. Nada é gravado até você clicar em Importar.</p>

      <label className="flex flex-col gap-1 text-sm text-muted">
        Arquivo CSV do Notion
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          disabled={!canWrite || busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
          className="text-sm text-ink"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {preview.isPending && <p className="text-sm text-muted">Analisando arquivo…</p>}

      {result ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm text-ink">
          <p className="font-semibold">{plural(result.created, 'lançamento criado', 'lançamentos criados')}</p>
          <p>
            {result.duplicates === 1 ? '1 já existia e foi ignorado' : `${result.duplicates} já existiam e foram ignorados`}
          </p>
          <p>{plural(result.invalidSkipped, 'linha inválida ignorada', 'linhas inválidas ignoradas')}</p>
          <Link to="/" className="text-ink underline">
            Voltar para Despesas
          </Link>
        </div>
      ) : (
        plan && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {plan.duplicates === 1
                ? '1 lançamento já existe e será ignorado'
                : `${plan.duplicates} lançamentos já existem e serão ignorados`}
            </p>

            <Section title="Séries parceladas" count={plan.installmentSeries.length}>
              {plan.installmentSeries.map((s) => (
                <div key={s.key} className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-ink">
                    {s.baseName} ({s.total}x)
                  </h3>
                  <Entries items={s.entries} />
                </div>
              ))}
            </Section>

            <Section title="Sugestões mensais" count={plan.monthlySuggestions.length}>
              {plan.monthlySuggestions.map((s) => (
                <div key={s.key} className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={choices[s.key] ?? s.active}
                      disabled={!canWrite || busy}
                      onChange={(e) => setChoices({ ...choices, [s.key]: e.target.checked })}
                    />
                    <span>
                      {s.name} — {formatBRL(s.amountCents)}, dia {s.dayOfMonth}
                    </span>
                  </label>
                  <div className="pl-6">
                    <Entries items={s.entries} />
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Avulsas" count={plan.singles.length}>
              <Entries items={plan.singles} />
            </Section>

            {invalidRows.length > 0 && (
              <Section title="Inválidas" count={invalidRows.length}>
                <ul className="flex flex-col gap-2">
                  {invalidRows.map((r) => (
                    <InvalidRow
                      key={r.rowId}
                      row={r}
                      draft={draftOf(r)}
                      canWrite={canWrite && !busy}
                      onChange={(d) => setDrafts({ ...drafts, [r.rowId]: d })}
                      onDiscard={() => discard(r.rowId)}
                    />
                  ))}
                </ul>
                <div>
                  <button
                    type="button"
                    className={btn}
                    disabled={!canWrite || busy || dirtyRows.length === 0 || hasBadDraft}
                    onClick={apply}
                  >
                    Aplicar correções
                  </button>
                </div>
              </Section>
            )}

            <div>
              <button
                type="button"
                className={btn}
                disabled={!canWrite || busy || dirtyRows.length > 0}
                onClick={doCommit}
              >
                Importar
              </button>
              {dirtyRows.length > 0 && (
                <span className="ml-2 text-xs text-muted">Aplique as correções antes de importar.</span>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );
}
