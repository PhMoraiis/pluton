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
