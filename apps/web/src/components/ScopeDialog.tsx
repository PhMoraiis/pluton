import { Modal } from './Modal';

export interface ScopeOption<T extends string> {
  value: T;
  label: string;
  danger?: boolean;
}

interface Props<T extends string> {
  title: string;
  message?: string;
  options: ScopeOption<T>[];
  onChoose: (value: T) => void;
  onCancel: () => void;
  /** Sem conexão/sessão: as opções ficam desabilitadas (Cancelar continua). */
  disabled?: boolean;
}

/**
 * Pergunta o alcance de uma ação em série (`Só esta` / `Esta e as próximas` /
 * `Série inteira`). Também serve de confirmação simples com uma única opção.
 */
export function ScopeDialog<T extends string>({ title, message, options, onChoose, onCancel, disabled = false }: Props<T>) {
  return (
    <Modal title={title} onClose={onCancel}>
      {message && <p className="mb-4 text-sm text-muted">{message}</p>}
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(o.value)}
            className={`rounded-md border px-3 py-2 text-left text-sm enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50 ${
              o.danger ? 'border-danger/50 text-danger' : 'border-line text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-hover">
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
