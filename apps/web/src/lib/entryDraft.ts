import {
  parseBRL,
  parseInstallmentName,
  type EntryDTO,
  type EntryKind,
  type IsoDate,
  type PaymentMethodDTO,
} from '@pluton/shared';
import type { CreateEntryInput, EntryPatch } from './entryMutations';

/** Campos digitados de um lançamento (nova linha e formulário). */
export interface EntryDraft {
  name: string;
  amount: string;
  dueDate: IsoDate;
  methodId: string;
  pixKey: string;
  monthly: boolean;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data real do calendário, anos 2000..2100 (mesma faixa da API). */
export function isValidDueDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return false;
  return d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Centavos → texto editável "1.234,56" (sem "R$"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valor digitado → centavos positivos, ou null. */
export function parseAmount(input: string): number | null {
  const cents = parseBRL(input);
  return cents !== null && cents > 0 ? cents : null;
}

/** `Cria parcelas x a y, uma por mês` quando o nome termina em `x/y`. */
export function installmentHint(name: string): string | null {
  const parsed = parseInstallmentName(name);
  return parsed ? `Cria parcelas ${parsed.current} a ${parsed.total}, uma por mês` : null;
}

export function sortedMethods(methods: PaymentMethodDTO[]): PaymentMethodDTO[] {
  return [...methods].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function isPix(methods: Map<string, PaymentMethodDTO>, id: string | null | undefined): boolean {
  return id != null && methods.get(id)?.name === 'Pix';
}

export function emptyDraft(dueDate: IsoDate, methodId: string): EntryDraft {
  return { name: '', amount: '', dueDate, methodId, pixKey: '', monthly: false };
}

export function draftFromEntry(entry: EntryDTO): EntryDraft {
  return {
    name: entry.displayName,
    amount: centsToInput(entry.amountCents),
    dueDate: entry.dueDate,
    methodId: entry.paymentMethodId ?? '',
    pixKey: entry.pixKey ?? '',
    monthly: entry.seriesType === 'MONTHLY',
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function validate(draft: EntryDraft): Result<{ name: string; amountCents: number }> {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Informe o nome.' };
  const amountCents = parseAmount(draft.amount);
  if (amountCents === null) return { ok: false, error: 'Valor inválido.' };
  if (!isValidDueDate(draft.dueDate)) return { ok: false, error: 'Data inválida.' };
  return { ok: true, value: { name, amountCents } };
}

export function draftToCreate(
  kind: EntryKind,
  draft: EntryDraft,
  methods: Map<string, PaymentMethodDTO>,
): Result<CreateEntryInput> {
  const v = validate(draft);
  if (!v.ok) return v;
  const input: CreateEntryInput = {
    kind,
    name: v.value.name,
    amountCents: v.value.amountCents,
    dueDate: draft.dueDate,
    paymentMethodId: draft.methodId || null,
  };
  const pixKey = draft.pixKey.trim();
  if (isPix(methods, draft.methodId) && pixKey) input.pixKey = pixKey;
  if (draft.monthly && !parseInstallmentName(v.value.name)) input.monthly = true;
  return { ok: true, value: input };
}

/** Só o que difere do lançamento atual (patch vazio = nada a salvar). */
export function draftToPatch(
  entry: EntryDTO,
  draft: EntryDraft,
  methods: Map<string, PaymentMethodDTO>,
): Result<EntryPatch> {
  const v = validate(draft);
  if (!v.ok) return v;
  const patch: EntryPatch = {};
  if (v.value.name !== entry.displayName) patch.name = v.value.name;
  if (v.value.amountCents !== entry.amountCents) patch.amountCents = v.value.amountCents;
  if (draft.dueDate !== entry.dueDate) patch.dueDate = draft.dueDate;
  const methodId = draft.methodId || null;
  if (methodId !== entry.paymentMethodId) patch.paymentMethodId = methodId;
  const pixKey = draft.pixKey.trim();
  if (isPix(methods, methodId) && pixKey !== (entry.pixKey ?? '')) patch.pixKey = pixKey;
  return { ok: true, value: patch };
}
