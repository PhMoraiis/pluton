// Paleta fixa de etiquetas no estilo Notion (tema escuro).
export const NOTION_COLORS = {
  gray: '#5A5A5A',
  brown: '#603B2C',
  orange: '#854C1D',
  yellow: '#89632A',
  green: '#2B593F',
  blue: '#28456C',
  purple: '#492F64',
  pink: '#69314C',
  red: '#6E3630',
} as const;

/** Métodos criados junto com o usuário (nomes fixos pela especificação). */
export const INITIAL_PAYMENT_METHODS = [
  { name: 'Pix', color: NOTION_COLORS.green, chargeNextMonth: false },
  { name: 'Cartão de crédito', color: NOTION_COLORS.purple, chargeNextMonth: true },
  { name: 'Débito', color: NOTION_COLORS.blue, chargeNextMonth: false },
  { name: 'Boleto', color: NOTION_COLORS.orange, chargeNextMonth: false },
  { name: 'Dinheiro', color: NOTION_COLORS.yellow, chargeNextMonth: false },
] as const;

/** Etiqueta de sistema criada junto com o usuário (pode ser renomeada e recolorida, mas não excluída). */
export const SUBSCRIPTION_TAG = {
  name: 'Assinatura',
  color: '#D9730D',
  system: 'SUBSCRIPTION',
} as const;
