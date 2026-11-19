/**
 * `<input type="month">` vira caixa de texto no Safari do macOS: o valor chega cru.
 * Estes atributos e mensagens orientam o formato `AAAA-MM` nesse caso.
 */
export const MONTH_PLACEHOLDER = 'AAAA-MM';
/** Atributo `pattern` (validação nativa quando o campo é texto). */
export const MONTH_PATTERN = '\\d{4}-(0[1-9]|1[0-2])';
/** Dica nativa (tooltip / mensagem de validação) do campo de mês. */
export const MONTH_TITLE = 'Use o formato AAAA-MM, por exemplo 2026-12.';

const MONTH_RE = new RegExp(`^${MONTH_PATTERN}$`);

/** `YYYY-MM` com mês 01..12 (mesma regra de `monthKeySchema` da API). */
export function isMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}
