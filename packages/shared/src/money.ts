const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const WITH_COMMA = /^(\d+|\d{1,3}(?:\.\d{3})+),(\d{1,2})$/;
const DOT_DECIMAL = /^(\d+)\.(\d{2})$/;
const INTEGER = /^(\d+|\d{1,3}(?:\.\d{3})+)$/;

/** Converte texto digitado em centavos inteiros; retorna null se inválido. */
export function parseBRL(input: string): number | null {
  const s = input.replace(/R\$/g, '').replace(/[\s\u00A0]/g, '');
  let whole: string;
  let frac = '';

  let m: RegExpMatchArray | null;
  if ((m = WITH_COMMA.exec(s))) {
    whole = m[1]!.replace(/\./g, '');
    frac = m[2]!;
  } else if (!s.includes(',') && (m = DOT_DECIMAL.exec(s))) {
    whole = m[1]!;
    frac = m[2]!;
  } else if (INTEGER.test(s)) {
    whole = s.replace(/\./g, '');
  } else {
    return null;
  }

  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Formata centavos como "R$ 1.717,96" (negativo: "-R$ 25,00"). */
export function formatBRL(cents: number): string {
  return BRL.format(cents / 100);
}
