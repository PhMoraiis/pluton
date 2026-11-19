import type { TagDTO } from '@pluton/shared';

/** Etiquetas conhecidas do lançamento, na ordem `sortOrder`/nome; ids desconhecidos são ignorados. */
export function TagChips({
  tagIds,
  tags,
  empty = false,
}: {
  tagIds: string[];
  tags: Map<string, TagDTO>;
  /** Mostra `—` quando não há etiqueta (tabela); no cartão fica vazio. */
  empty?: boolean;
}) {
  const known = tagIds
    .map((id) => tags.get(id))
    .filter((t): t is TagDTO => t !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'));
  if (known.length === 0) return empty ? <span className="text-muted">—</span> : null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {known.map((t) => (
        <span
          key={t.id}
          className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${t.color}33`, color: t.color }}
        >
          {t.name}
        </span>
      ))}
    </span>
  );
}
