'use client';

import { DatePicker } from '../../components/ui/date-picker';
import type { KpiComparisonMode } from '../../types/entities';
import { cn } from '../../utils/cn';
import { resolvePeriodRange, type PeriodRange } from './period';

export const COMPARISON_MODES: { value: KpiComparisonMode; label: string }[] = [
  { value: 'PREVIOUS_PERIOD', label: 'Período anterior' },
  { value: 'PREVIOUS_YEAR', label: 'Mesmo período do ano passado' },
  { value: 'CUSTOM', label: 'Personalizado' },
];

// BI 7 -- unica resolucao de intervalo personalizado de comparacao (mesma
// conversao dia-local -> ISO do periodo principal). Reaproveitado pelo BI 9 --
// nenhum segundo algoritmo de comparacao.
export function resolveCompareRange(mode: KpiComparisonMode, from: string, to: string): PeriodRange | null {
  return mode === 'CUSTOM' ? resolvePeriodRange('custom', new Date(), { from, to }) : null;
}

// BI 7 -- seletor de modo de comparacao (periodo anterior/ano anterior/
// personalizado), extraido para reuso pelo BI 9 (Relatorios).
export function ComparisonModePicker({
  mode,
  onModeChange,
  compareFrom,
  compareTo,
  onCompareFromChange,
  onCompareToChange,
}: {
  mode: KpiComparisonMode;
  onModeChange: (mode: KpiComparisonMode) => void;
  compareFrom: string;
  compareTo: string;
  onCompareFromChange: (value: string) => void;
  onCompareToChange: (value: string) => void;
}): JSX.Element {
  const invalidCompareRange = mode === 'CUSTOM' && compareFrom !== '' && compareTo !== '' && compareFrom > compareTo;
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Comparar com" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-muted p-0.5">
        {COMPARISON_MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => onModeChange(option.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
              mode === option.value ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === 'CUSTOM' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="compare-from">
            Data inicial de referência
          </label>
          <DatePicker id="compare-from" value={compareFrom} max={compareTo || undefined} onChange={(e) => onCompareFromChange(e.target.value)} />
          <span className="text-xs text-ink-muted">até</span>
          <label className="sr-only" htmlFor="compare-to">
            Data final de referência
          </label>
          <DatePicker id="compare-to" value={compareTo} min={compareFrom || undefined} onChange={(e) => onCompareToChange(e.target.value)} />
          {invalidCompareRange && (
            <p role="alert" className="w-full text-xs text-danger-700">
              A data inicial precisa ser anterior à final.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
