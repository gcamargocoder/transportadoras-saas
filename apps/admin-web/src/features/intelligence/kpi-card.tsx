'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import Link from 'next/link';
import type { KpiResultEntity } from '../../types/entities';
import { cn } from '../../utils/cn';
import { KPI_DRILL_DOWN } from './intelligence-config';
import {
  formatKpiAbsoluteChange,
  formatKpiValue,
  formatKpiValueParts,
  formatPercentChange,
  resolveTrendTone,
  type KpiTrendTone,
} from './kpi-format';

const TREND_STYLES: Record<KpiTrendTone, string> = {
  positive: 'bg-success-50 text-success-700',
  negative: 'bg-danger-50 text-danger-700',
  neutral: 'bg-info-50 text-info-700',
  unavailable: 'bg-warning-50 text-warning-700',
};

const TREND_DESCRIPTION: Record<KpiTrendTone, string> = {
  positive: 'melhora',
  negative: 'piora',
  neutral: 'variação neutra',
  unavailable: 'sem comparação',
};

export function KpiTrend({ kpi }: { kpi: KpiResultEntity }): JSX.Element | null {
  const comparison = kpi.comparison;
  if (!comparison) return null;
  const tone = resolveTrendTone(kpi);

  if (tone === 'unavailable') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TREND_STYLES[tone])}>
        Sem base de comparação
      </span>
    );
  }

  const change = comparison.absoluteChange ?? 0;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const headline =
    change === 0
      ? 'Estável'
      : comparison.percentChange !== null
        ? formatPercentChange(comparison.percentChange)
        : formatKpiAbsoluteChange(kpi.unit, change);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold', TREND_STYLES[tone])}
        aria-label={`${headline} em relação ao período anterior (${TREND_DESCRIPTION[tone]})`}
      >
        <Icon size={13} aria-hidden />
        {headline}
      </span>
      {change !== 0 && comparison.percentChange !== null && (
        <span className="text-xs text-ink-muted">{formatKpiAbsoluteChange(kpi.unit, change)}</span>
      )}
    </span>
  );
}

// Card de KPI oficial. Nunca calcula nada: exibe value/comparison da API.
// "Como é calculado" (roxo = analise) abre o contexto do KPI; o link leva a
// tela detalhada ja existente quando houver.
export function KpiCard({
  kpi,
  icon: Icon,
  size = 'md',
  onExplain,
  className,
}: {
  kpi: KpiResultEntity;
  icon?: LucideIcon;
  size?: 'lg' | 'md';
  onExplain?: (kpi: KpiResultEntity) => void;
  className?: string;
}): JSX.Element {
  const drill = KPI_DRILL_DOWN[kpi.id];
  const unavailable = kpi.status === 'UNAVAILABLE' || kpi.value === null;
  const parts = unavailable ? null : formatKpiValueParts(kpi.unit, kpi.value as number);
  const headingId = `kpi-${kpi.id}-label`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col rounded-lg border border-border bg-white shadow-xs',
        size === 'lg' ? 'p-5 sm:p-6' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={headingId} className="text-sm font-medium text-ink-muted">
          {kpi.name}
        </h3>
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink-muted" aria-hidden>
            <Icon size={16} />
          </span>
        )}
      </div>

      {unavailable ? (
        <div className="mt-3">
          <p className={cn('font-semibold tracking-tight text-ink-subtle', size === 'lg' ? 'text-3xl' : 'text-2xl')}>—</p>
          <p className="mt-1.5 text-xs text-warning-700">{kpi.unavailableReason ?? 'Dados insuficientes no período.'}</p>
        </div>
      ) : (
        <div className="mt-3">
          <p className={cn('font-semibold tracking-tight text-ink tabular-nums', size === 'lg' ? 'text-3xl' : 'text-2xl')}>
            {parts?.value}
            {parts?.suffix && (
              <span className={cn('ml-0.5 font-medium text-ink-muted', size === 'lg' ? 'text-lg' : 'text-base')}>
                {parts.suffix}
              </span>
            )}
          </p>
          <div className="mt-2 min-h-[1.5rem]">
            <KpiTrend kpi={kpi} />
          </div>
          {kpi.comparison && kpi.comparison.value !== null && (
            <p className="mt-1 text-xs text-ink-subtle">
              Período anterior: {formatKpiValue(kpi.unit, kpi.comparison.value)}
            </p>
          )}
        </div>
      )}

      {(onExplain || drill) && (
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          {onExplain ? (
            <button
              type="button"
              onClick={() => onExplain(kpi)}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-violet-700 hover:text-violet-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
              aria-label={`Como é calculado: ${kpi.name}`}
            >
              <Info size={13} aria-hidden />
              Como é calculado
            </button>
          ) : (
            <span />
          )}
          {drill && (
            <Link
              href={drill.href}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-brand-700 hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              aria-label={`${drill.label}: ${kpi.name}`}
            >
              {drill.label}
              <ArrowRight size={13} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
