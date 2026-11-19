import { PALETTE } from '../../lib/palette';

export function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-1.5">
      {PALETTE.map((p) => {
        const selected = p.color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={p.color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={p.name}
            title={p.name}
            disabled={disabled}
            onClick={() => onChange(p.color)}
            style={{ backgroundColor: p.color }}
            className={`h-7 w-7 rounded-full border-2 disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'border-ink' : 'border-transparent'}`}
          />
        );
      })}
    </div>
  );
}
