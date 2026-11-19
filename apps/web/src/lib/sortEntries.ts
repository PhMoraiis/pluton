import type { EntryDTO, PaymentMethodDTO } from '@pluton/shared';

export type SortKey = 'data' | 'nome' | 'valor' | 'metodo';
export type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

export const SORT_KEYS: readonly SortKey[] = ['data', 'nome', 'valor', 'metodo'];

const SORT_RE = /^(data|nome|valor|metodo)-(asc|desc)$/;

/** Valor de `?ordem=`; ausente, inválido ou antigo (ex.: `valor`) vira `null` (ordem padrão). */
export function parseSort(param: string | null): SortState {
  const m = param ? SORT_RE.exec(param) : null;
  return m ? { key: m[1] as SortKey, dir: m[2] as 'asc' | 'desc' } : null;
}

export function formatSort(s: SortState): string | null {
  return s ? `${s.key}-${s.dir}` : null;
}

/** Ciclo por coluna: asc → desc → padrão. Outra coluna começa em asc. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}

const text = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });

function tieBreak(a: EntryDTO, b: EntryDTO): number {
  return (
    (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) ||
    text(a.displayName, b.displayName) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function sortEntries(rows: EntryDTO[], sort: SortState, methods: Map<string, PaymentMethodDTO>): EntryDTO[] {
  if (!sort) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  const methodName = (e: EntryDTO) => (e.paymentMethodId ? methods.get(e.paymentMethodId)?.name : undefined);

  return [...rows].sort((a, b) => {
    switch (sort.key) {
      case 'data': {
        const c = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
        return sign * c || tieBreak(a, b);
      }
      case 'nome':
        return sign * text(a.displayName, b.displayName) || tieBreak(a, b);
      case 'valor':
        return sign * (a.amountCents - b.amountCents) || tieBreak(a, b);
      case 'metodo': {
        const na = methodName(a);
        const nb = methodName(b);
        if (na === undefined || nb === undefined) {
          if (na === nb) return tieBreak(a, b);
          return na === undefined ? 1 : -1; // sem método sempre por último
        }
        return sign * text(na, nb) || tieBreak(a, b);
      }
    }
  });
}

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Padrão' },
  { value: 'data-asc', label: 'Data (mais antiga primeiro)' },
  { value: 'data-desc', label: 'Data (mais recente primeiro)' },
  { value: 'nome-asc', label: 'Nome (A–Z)' },
  { value: 'nome-desc', label: 'Nome (Z–A)' },
  { value: 'valor-asc', label: 'Valor (menor primeiro)' },
  { value: 'valor-desc', label: 'Valor (maior primeiro)' },
  { value: 'metodo-asc', label: 'Método (A–Z)' },
  { value: 'metodo-desc', label: 'Método (Z–A)' },
];
