import type { TagDTO } from '@pluton/shared';
import { useId } from 'react';

/** Etiquetas na ordem `sortOrder`/nome (a mesma dos chips). */
export function sortedTags(tags: TagDTO[]): TagDTO[] {
  return [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'));
}

interface Props {
  value: string[];
  tags: TagDTO[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  /** Nome acessível do grupo. */
  label: string;
}

/** Lista de checkboxes, uma por etiqueta. */
export function TagPicker({ value, tags, onChange, disabled, label }: Props) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      {sortedTags(tags).map((t) => (
        <label key={t.id} htmlFor={`${id}-${t.id}`} className="flex items-center gap-2 text-sm text-ink">
          <input
            id={`${id}-${t.id}`}
            type="checkbox"
            checked={value.includes(t.id)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? [...value, t.id] : value.filter((v) => v !== t.id))}
          />
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
          {t.name}
        </label>
      ))}
    </div>
  );
}
