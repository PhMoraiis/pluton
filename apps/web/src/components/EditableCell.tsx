import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Nome do campo, ex.: "Valor" → botão "Editar valor: X", campo "Valor: X". */
  field: string;
  entryName: string;
  display: ReactNode;
  /** Valor inicial do editor (texto, `YYYY-MM-DD` ou id do método). */
  initial: string;
  type?: 'text' | 'date' | 'select';
  options?: { value: string; label: string }[];
  disabled: boolean;
  align?: 'left' | 'right';
  /** Chamado só quando o valor mudou (Enter, blur ou escolha no select). */
  onCommit: (value: string) => void;
}

const editor = 'w-full rounded border border-accent bg-bg px-1.5 py-0.5 text-sm text-ink outline-none';

/** Célula com edição inline: clique/Enter edita; Enter ou blur salva se mudou; Esc cancela. */
export function EditableCell({
  field,
  entryName,
  display,
  initial,
  type = 'text',
  options = [],
  disabled,
  align = 'left',
  onCommit,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    // Ao sair da edição, o foco volta para a célula (navegação por teclado).
    if (wasEditing.current && !editing) button.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  // Ficou offline no meio da edição: descarta.
  useEffect(() => {
    if (disabled) setEditing(false);
  }, [disabled]);

  function start() {
    if (disabled) return;
    done.current = false;
    setValue(initial);
    setEditing(true);
  }

  function finish(save: boolean, next = value) {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (save && next !== initial) onCommit(next);
  }

  const label = `${field}: ${entryName}`;
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };

  if (editing) {
    if (type === 'select') {
      return (
        <select
          autoFocus
          aria-label={label}
          className={editor}
          value={value}
          onChange={(e) => finish(true, e.target.value)}
          onBlur={() => finish(false)}
          onKeyDown={keys}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        autoFocus
        aria-label={label}
        type={type}
        inputMode={field === 'Valor' ? 'decimal' : undefined}
        className={`${editor} ${align === 'right' ? 'text-right' : ''}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={keys}
      />
    );
  }

  return (
    <button
      ref={button}
      type="button"
      aria-label={`Editar ${field.toLowerCase()}: ${entryName}`}
      disabled={disabled}
      onClick={start}
      className={`-mx-1 block w-full rounded px-1 py-0.5 ${align === 'right' ? 'text-right' : 'text-left'} enabled:cursor-text enabled:hover:bg-hover disabled:cursor-default`}
    >
      {display}
    </button>
  );
}
