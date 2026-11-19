import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `sheet`: ancorado embaixo no celular (formulário); `dialog`: centralizado. */
  variant?: 'dialog' | 'sheet';
}

/** Janela modal simples: Esc ou clique fora fecha; foca o primeiro controle ao abrir. */
export function Modal({ title, onClose, children, variant = 'dialog' }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>(
      '[data-autofocus], input:not([disabled]), select:not([disabled]), button:not([disabled])',
    );
    first?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const position =
    variant === 'sheet' ? 'items-end sm:items-center' : 'items-center';
  const shape = variant === 'sheet' ? 'rounded-t-xl sm:rounded-xl' : 'rounded-xl';

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/60 p-0 sm:p-4 ${position}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full max-w-md border border-line bg-surface p-4 shadow-xl ${shape} ${variant === 'dialog' ? 'mx-4' : ''}`}
      >
        <h2 id={titleId} className="mb-3 text-base font-semibold text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
