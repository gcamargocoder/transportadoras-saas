'use client';

import { DatePicker } from '../../components/ui/date-picker';
import { cn } from '../../utils/cn';
import { PERIOD_PRESET_LABELS, PERIOD_PRESETS, type PeriodPreset } from './period';

// Seletor unico de periodo da Central (segmented control + datas quando
// "Personalizado"). O mesmo periodo alimenta todos os KPIs da tela.
export function PeriodSelector({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomChange,
}: {
  preset: PeriodPreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomChange: (range: { from: string; to: string }) => void;
}): JSX.Element {
  const invalidCustom = preset === 'custom' && customFrom !== '' && customTo !== '' && customFrom > customTo;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div
        role="radiogroup"
        aria-label="Período de análise"
        className="flex w-full overflow-x-auto rounded-lg border border-border bg-surface-muted p-0.5 sm:w-auto"
      >
        {PERIOD_PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={preset === value}
            onClick={() => onPresetChange(value)}
            className={cn(
              'flex-1 shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 sm:flex-none',
              preset === value ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink',
            )}
          >
            {PERIOD_PRESET_LABELS[value]}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="intelligence-from">
            Data inicial
          </label>
          <DatePicker
            id="intelligence-from"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => onCustomChange({ from: e.target.value, to: customTo })}
          />
          <span className="text-xs text-ink-muted">até</span>
          <label className="sr-only" htmlFor="intelligence-to">
            Data final
          </label>
          <DatePicker
            id="intelligence-to"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => onCustomChange({ from: customFrom, to: e.target.value })}
          />
          {invalidCustom && (
            <p role="alert" className="w-full text-xs text-danger-700 sm:text-right">
              A data inicial precisa ser anterior à final.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
