import { useEffect, useState } from 'react';

/** `Copiar chave` Pix para a área de transferência; mostra `Copiada!` por 2 s. */
export function PixCopyButton({ pixKey }: { pixKey: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pixKey);
      setState('copied');
    } catch {
      // Sem Clipboard API (contexto inseguro) ou permissão negada.
      setState('failed');
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={pixKey}
      className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-accent hover:bg-hover"
    >
      <span aria-live="polite">
        {state === 'copied' ? 'Copiada!' : state === 'failed' ? 'Não foi possível copiar' : 'Copiar chave'}
      </span>
    </button>
  );
}
