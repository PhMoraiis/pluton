import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monthKeyOf, todayInSaoPaulo, type PaymentMethodDTO, type SalaryDTO } from '@pluton/shared';
import { useState, type FormEvent } from 'react';
import { Modal } from '../Modal';
import { apiFetch } from '../../lib/api';
import { centsToInput, maskAmount, parseAmount, sortedMethods } from '../../lib/entryDraft';
import { invalidateEntryQueries } from '../../lib/entryMutations';
import { friendlyError } from '../../lib/errors';
import { useCanWrite } from '../../lib/online';
import { queryKeys } from '../../lib/queryKeys';
import { btn, input } from './styles';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

function SalaryForm({ salary, currentMonth }: { salary: SalaryDTO | null; currentMonth: string }) {
  const canWrite = useCanWrite();
  const client = useQueryClient();
  const [amount, setAmount] = useState(salary ? centsToInput(salary.amountCents) : '');
  const [day, setDay] = useState(String(salary?.dayOfMonth ?? 31));
  const [startMonth, setStartMonth] = useState<string>(salary?.startMonth ?? currentMonth);
  const [methodId, setMethodId] = useState(salary?.paymentMethodId ?? '');
  const [deactivating, setDeactivating] = useState(false);
  const [lastMonth, setLastMonth] = useState(currentMonth);

  const methods = useQuery({
    queryKey: queryKeys.paymentMethods(),
    queryFn: () => apiFetch<PaymentMethodDTO[]>('/api/payment-methods'),
  });

  const save = useMutation({
    mutationFn: (body: { amountCents: number; dayOfMonth: number; startMonth: string; paymentMethodId: string | null }) =>
      apiFetch<SalaryDTO>('/api/salary', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => invalidateEntryQueries(client),
  });
  const deactivate = useMutation({
    mutationFn: (month: string) => apiFetch<void>(`/api/salary?${new URLSearchParams({ lastMonth: month })}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeactivating(false);
      await invalidateEntryQueries(client);
    },
  });

  const cents = parseAmount(amount);
  const valid = cents !== null && startMonth !== '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || save.isPending || !valid) return;
    save.mutate({ amountCents: cents, dayOfMonth: Number(day), startMonth, paymentMethodId: methodId || null });
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line p-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Valor estimado
          <input
            inputMode="decimal"
            value={amount}
            disabled={!canWrite}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => setAmount(maskAmount(amount))}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Dia do pagamento
          <select value={day} disabled={!canWrite} onChange={(e) => setDay(e.target.value)} className={input}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="31">Último dia do mês</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Mês de início
          <input
            type="month"
            value={startMonth}
            min={currentMonth}
            disabled={!canWrite || salary !== null}
            onChange={(e) => setStartMonth(e.target.value)}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Método de recebimento
          <select value={methodId} disabled={!canWrite} onChange={(e) => setMethodId(e.target.value)} className={input}>
            <option value="">Sem método</option>
            {sortedMethods(methods.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {save.isError && (
          <p role="alert" className="text-sm text-red-400">
            {friendlyError(save.error)}
          </p>
        )}
        {save.isSuccess && (
          <p role="status" className="text-sm text-muted">
            Salário salvo.
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={!canWrite || save.isPending || !valid} className={btn}>
            Salvar salário
          </button>
          {salary && (
            <button
              type="button"
              disabled={!canWrite}
              className={btn}
              onClick={() => {
                deactivate.reset();
                setLastMonth(currentMonth);
                setDeactivating(true);
              }}
            >
              Desativar salário
            </button>
          )}
        </div>
      </form>

      {deactivating && (
        <Modal title="Desativar salário" onClose={() => setDeactivating(false)}>
          <p className="mb-3 text-sm text-muted">Os lançamentos de salário pendentes depois deste mês serão removidos.</p>
          <label className="mb-3 flex flex-col gap-1 text-sm text-muted">
            Último mês com salário
            <input
              type="month"
              value={lastMonth}
              disabled={!canWrite}
              onChange={(e) => setLastMonth(e.target.value)}
              className={input}
            />
          </label>
          {deactivate.isError && (
            <p role="alert" className="mb-2 text-sm text-red-400">
              {friendlyError(deactivate.error)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={btn}
              disabled={!canWrite || deactivate.isPending || lastMonth === ''}
              onClick={() => deactivate.mutate(lastMonth)}
            >
              Confirmar
            </button>
            <button type="button" className={btn} onClick={() => setDeactivating(false)}>
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function SalarySection() {
  const salary = useQuery({
    queryKey: queryKeys.salary(),
    queryFn: () => apiFetch<SalaryDTO | null>('/api/salary'),
  });
  const currentMonth = monthKeyOf(todayInSaoPaulo());

  return (
    <section aria-label="Salário" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">Salário</h2>
      {salary.isError && !salary.data && (
        <p role="alert" className="text-sm text-red-400">
          Não foi possível carregar o salário.
        </p>
      )}
      {salary.data !== undefined && (
        // Remonta o formulário quando o salário muda no servidor (criação, desativação).
        <SalaryForm key={salary.data ? 'active' : 'none'} salary={salary.data} currentMonth={currentMonth} />
      )}
    </section>
  );
}
