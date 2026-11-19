import type { PaymentMethodDTO } from '@pluton/shared';

/** Etiqueta colorida do método de pagamento (estilo Notion). */
export function MethodTag({ method }: { method: PaymentMethodDTO | undefined }) {
  if (!method) return <span className="text-muted">—</span>;
  return (
    <span
      className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${method.color}33`, color: method.color }}
    >
      {method.name}
    </span>
  );
}
