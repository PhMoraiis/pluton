import type { EntryDTO } from '@pluton/shared';
import { copyablePixKey } from '../lib/entryDraft';
import { useEntryActions } from './EntryActions';
import { PixCopyButton } from './PixCopyButton';

const iconButton = 'rounded p-1 text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';

export function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Ações de uma linha da tabela: copiar chave Pix, editar, encerrar série, excluir. */
export function RowActions({ entry }: { entry: EntryDTO }) {
  const { canWrite, methods, openEditor, endSeries, remove } = useEntryActions();
  const pixKey = copyablePixKey(entry, methods);
  const name = entry.displayName;
  return (
    <span className="flex items-center justify-end gap-0.5">
      {pixKey && <PixCopyButton pixKey={pixKey} />}
      <button
        type="button"
        aria-label={`Editar: ${name}`}
        title="Editar"
        disabled={!canWrite}
        onClick={() => openEditor(entry)}
        className={iconButton}
      >
        <PencilIcon />
      </button>
      {entry.seriesType === 'MONTHLY' && (
        <button
          type="button"
          aria-label={`Encerrar série: ${name}`}
          disabled={!canWrite}
          onClick={() => endSeries(entry)}
          className={`${iconButton} whitespace-nowrap px-1.5 text-xs`}
        >
          Encerrar
        </button>
      )}
      <button
        type="button"
        aria-label={`Excluir: ${name}`}
        title="Excluir"
        disabled={!canWrite}
        onClick={() => remove(entry)}
        className={`${iconButton} hover:text-danger`}
      >
        <TrashIcon />
      </button>
    </span>
  );
}
