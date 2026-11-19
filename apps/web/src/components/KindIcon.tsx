import type { EntryKind } from '@pluton/shared';

/** Seta vermelha para baixo (despesa) ou verde para cima (ganho). */
export function KindIcon({ kind }: { kind: EntryKind }) {
  const expense = kind === 'EXPENSE';
  return (
    <svg
      role="img"
      aria-label={expense ? 'Despesa' : 'Ganho'}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className="shrink-0"
      fill="none"
      stroke={expense ? '#eb5757' : '#4dab9a'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {expense ? <path d="M8 3v10m0 0-4-4m4 4 4-4" /> : <path d="M8 13V3m0 0L4 7m4-4 4 4" />}
    </svg>
  );
}
