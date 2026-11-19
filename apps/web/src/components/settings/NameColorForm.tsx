import { useState, type FormEvent } from 'react';
import { btn, input } from './styles';
import { ColorPicker } from './ColorPicker';

export interface Draft {
  name: string;
  color: string;
}

export function NameColorForm({
  initial,
  nameLabel,
  maxLength,
  submitLabel,
  canWrite,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  nameLabel: string;
  maxLength: number;
  submitLabel: string;
  canWrite: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: Draft) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const valid = draft.name.trim().length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || pending || !valid) return;
    onSubmit({ name: draft.name.trim(), color: draft.color });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-muted">
        {nameLabel}
        <input
          value={draft.name}
          maxLength={maxLength}
          disabled={!canWrite}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className={input}
        />
      </label>
      <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} disabled={!canWrite} />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!canWrite || pending || !valid} className={btn}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={btn}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
