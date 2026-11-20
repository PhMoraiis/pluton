interface Props {
  /** `true` = "Próximo mês". */
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

const OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Este mês', value: false },
  { label: 'Próximo mês', value: true },
];

/** Seletor segmentado "Cobrar: Este mês / Próximo mês" da criação de lançamento. */
export function ChargeMonthToggle({ value, onChange, disabled = false }: Props) {
  return (
    <div role="radiogroup" aria-label="Cobrar" className="mt-1 inline-flex overflow-hidden rounded border border-line text-xs">
      {OPTIONS.map((o) => {
        const checked = value === o.value;
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
              checked ? 'bg-accent text-white' : 'bg-bg text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
