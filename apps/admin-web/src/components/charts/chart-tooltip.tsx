'use client';

import type { TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

// Tooltip customizado compartilhado por todos os graficos Recharts do
// projeto (comeca com MonthlyChartCard, Task 11) -- estilo unico
// (bg-surface/border/shadow-popover, reage a dark mode) em vez de repetir
// contentStyle inline em cada grafico.
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: TooltipProps<ValueType, NameType> & {
  valueFormatter: (value: number) => string;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-popover">
      <p className="font-medium text-ink-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{valueFormatter(value)}</p>
    </div>
  );
}
