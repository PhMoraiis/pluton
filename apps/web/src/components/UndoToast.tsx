import { useEffect, useRef } from 'react';

export const UNDO_MS = 5000;

interface Props {
  message: string;
  onUndo: () => void;
  onClose: () => void;
  disabled?: boolean;
}

/** Aviso com `Desfazer` que some sozinho após 5 s. Remonte (via `key`) para reiniciar o prazo. */
export function UndoToast({ message, onUndo, onClose, disabled = false }: Props) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const t = setTimeout(() => close.current(), UNDO_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-40 md:bottom-6 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink shadow-xl"
    >
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onUndo}
        className="rounded px-2 py-1 font-medium text-accent hover:bg-hover disabled:opacity-50"
      >
        Desfazer
      </button>
    </div>
  );
}
