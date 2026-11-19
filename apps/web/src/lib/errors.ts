import { ApiError, UnauthorizedError } from './api';

/** Códigos de erro da API (`{ error: string }`) com mensagem amigável. */
const MESSAGES: Record<string, string> = {
  scope_required: 'Escolha se a alteração vale só para esta ou também para as próximas.',
  total_below_paid_installment: 'O total de parcelas não pode ser menor que a última parcela paga.',
  total_below_edited_installment: 'O total de parcelas não pode ser menor que o número desta parcela.',
  total_change_requires_following: 'Para mudar o total de parcelas, escolha "Esta e as próximas".',
  installment_cannot_be_monthly: 'Parcelas (x/y) não podem ser mensais.',
  invalid_payment_method: 'Método de pagamento inválido.',
  invalid_body: 'Dados inválidos. Confira os campos.',
  not_found: 'Lançamento não encontrado. Ele pode ter sido excluído.',
  duplicate_name: 'Já existe um método com esse nome.',
  payload_too_large: 'Arquivo grande demais (máximo 2 MB).',
  not_monthly: 'Só séries mensais podem ser encerradas.',
};

export const GENERIC_ERROR = 'Não foi possível concluir a ação. Tente de novo.';

/** Mensagem para o usuário a partir de um erro de mutação. */
export function friendlyError(error: unknown): string {
  if (error instanceof UnauthorizedError) return error.message;
  if (error instanceof ApiError) return MESSAGES[error.message] ?? GENERIC_ERROR;
  // `fetch` rejeita com TypeError quando não há conexão.
  if (error instanceof TypeError) return 'Sem conexão. Tente de novo quando estiver online.';
  return GENERIC_ERROR;
}

/** Códigos de erro do Better Auth (1.7) que a tela de login pode receber. */
const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha incorretos.',
  INVALID_EMAIL: 'E-mail inválido.',
  INVALID_PASSWORD: 'Senha inválida.',
  PASSWORD_TOO_SHORT: 'Senha curta demais: use pelo menos 8 caracteres.',
  PASSWORD_TOO_LONG: 'Senha longa demais.',
  USER_ALREADY_EXISTS: 'Já existe uma conta com esse e-mail.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Já existe uma conta com esse e-mail.',
};

export const RATE_LIMITED_MESSAGE = 'Muitas tentativas. Aguarde alguns segundos e tente de novo.';

/**
 * Mensagem em pt-BR para um erro do cliente do Better Auth (`res.error`). Mensagens do
 * Better Auth vêm em inglês e nunca vão para a tela; a exceção é o 403 do cadastro, cuja
 * mensagem é a nossa (conta única, em `apps/api/src/auth.ts`).
 */
export function authErrorMessage(
  error: { status: number; code?: string; message?: string },
  fallback: string,
): string {
  if (error.status === 429) return RATE_LIMITED_MESSAGE;
  if (error.code && AUTH_MESSAGES[error.code]) return AUTH_MESSAGES[error.code]!;
  if (error.status === 401) return AUTH_MESSAGES.INVALID_EMAIL_OR_PASSWORD!;
  if (error.status === 403 && error.message) return error.message;
  if (error.status === 413) return 'Dados grandes demais. Confira os campos.';
  if (error.status >= 500) return 'O servidor não respondeu como esperado. Tente de novo.';
  return fallback;
}
