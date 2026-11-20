import {
  addMonthsClamped,
  formatBRL,
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
  tagIds: string[];
  /** Seletor "Cobrar": true = "Próximo mês" (só na criação). */
  nextMonth: boolean;
  /** Data de antes do avanço, para voltar exatamente a ela; null se a data foi digitada. */
  shiftedFrom: IsoDate | null;
}

/** Limites da API (`nameSchema` / `pixKeySchema` em apps/api/src/routes/entries.ts). */
export const MAX_NAME_LENGTH = 120;
export const MAX_PIX_KEY_LENGTH = 140;

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

/** Máscara BRL ao sair do campo: valor válido vira "R$ 1.500,00"; inválido fica como está. */
export function maskAmount(input: string): string {
  const cents = parseAmount(input);
  return cents === null ? input : formatBRL(cents);
}

/** `Cria parcelas x a y, uma por mês` quando o nome termina em `x/y`. */
export function installmentHint(name: string): string | null {
  const parsed = parseInstallmentName(name);
  return parsed ? `Cria parcelas ${parsed.current} a ${parsed.total}, uma por mês` : null;
}

/** Só os ids de etiquetas que ainda existem (excluída em outra aba some depois do refetch). */
export function knownTagIds(ids: string[], tags: Map<string, unknown>): string[] {
  return ids.filter((id) => tags.has(id));
}

/** Mesmo conjunto de etiquetas, sem importar a ordem. */
export function sameTagSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function sortedMethods(methods: PaymentMethodDTO[]): PaymentMethodDTO[] {
  return [...methods].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Método Pix pelo nome, tolerante a renomeação de caixa/espaços ("PIX", " pix "). */
export function isPix(methods: Map<string, PaymentMethodDTO>, id: string | null | undefined): boolean {
  return id != null && methods.get(id)?.name.trim().toLowerCase() === 'pix';
}

/** Troca o método; saindo de Pix, a chave é descartada (ela só existe com Pix). */
export function withMethod(draft: EntryDraft, methodId: string, methods: Map<string, PaymentMethodDTO>): EntryDraft {
  return { ...draft, methodId, pixKey: isPix(methods, methodId) ? draft.pixKey : '' };
}

/** Liga/desliga "Próximo mês": desloca a data visível em um mês; data inválida só troca o seletor. */
export function setChargeNextMonth(draft: EntryDraft, next: boolean): EntryDraft {
  if (draft.nextMonth === next) return draft;
  if (!isValidDueDate(draft.dueDate)) return { ...draft, nextMonth: next };
  if (next) return { ...draft, nextMonth: true, shiftedFrom: draft.dueDate, dueDate: addMonthsClamped(draft.dueDate, 1) };
  return { ...draft, nextMonth: false, shiftedFrom: null, dueDate: draft.shiftedFrom ?? addMonthsClamped(draft.dueDate, -1) };
}

/** Data digitada vale como está: esquece o deslocamento guardado; o seletor não muda. */
export function withDueDate(draft: EntryDraft, dueDate: string): EntryDraft {
  return { ...draft, dueDate, shiftedFrom: null };
}

/** Troca de método na criação: aplica também o padrão "Cobrar" do método. */
export function withCreateMethod(draft: EntryDraft, methodId: string, methods: Map<string, PaymentMethodDTO>): EntryDraft {
  return setChargeNextMonth(withMethod(draft, methodId, methods), methods.get(methodId)?.chargeNextMonth ?? false);
}

/** Patch de troca de método: saindo de Pix com chave gravada, limpa a chave. */
export function methodPatch(
  entry: EntryDTO,
  methodId: string | null,
  methods: Map<string, PaymentMethodDTO>,
): EntryPatch {
  return entry.pixKey && !isPix(methods, methodId) ? { paymentMethodId: methodId, pixKey: null } : { paymentMethodId: methodId };
}

/** `Copiar chave` só faz sentido com método Pix e chave preenchida. */
export function copyablePixKey(entry: EntryDTO, methods: Map<string, PaymentMethodDTO>): string | null {
  return entry.pixKey && isPix(methods, entry.paymentMethodId) ? entry.pixKey : null;
}

export function emptyDraft(dueDate: IsoDate, methodId: string): EntryDraft {
  return { name: '', amount: '', dueDate, methodId, pixKey: '', monthly: false, tagIds: [], nextMonth: false, shiftedFrom: null };
}

export function draftFromEntry(entry: EntryDTO, tags?: Map<string, unknown>): EntryDraft {
  return {
    name: entry.displayName,
    amount: centsToInput(entry.amountCents),
    dueDate: entry.dueDate,
    methodId: entry.paymentMethodId ?? '',
    pixKey: entry.pixKey ?? '',
    monthly: entry.seriesType === 'MONTHLY',
    tagIds: tags ? knownTagIds(entry.tagIds, tags) : entry.tagIds,
    nextMonth: false,
    shiftedFrom: null,
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
  tags?: Map<string, unknown>,
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
  if (isPix(methods, methodId)) {
    if (pixKey !== (entry.pixKey ?? '')) patch.pixKey = pixKey;
  } else if (patch.paymentMethodId !== undefined && entry.pixKey) {
    // Só descarta a chave quando o método realmente mudou para não-Pix. Com o método
    // inalterado (ex.: lista de métodos ainda não carregada), a chave gravada fica como está.
    patch.pixKey = null;
  }
  const draftTags = tags ? knownTagIds(draft.tagIds, tags) : draft.tagIds;
  const entryTags = tags ? knownTagIds(entry.tagIds, tags) : entry.tagIds;
  if (!sameTagSet(draftTags, entryTags)) patch.tagIds = draftTags;
  return { ok: true, value: patch };
}
