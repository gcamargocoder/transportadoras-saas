'use client';

import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { RadialGauge } from '../../components/ui/radial-gauge';
import type { KpiResultEntity } from '../../types/entities';
import { formatNumber } from '../../utils/format';
import { KpiTrend } from './kpi-card';
import { findInput, formatKpiValue } from './kpi-format';

// Abaixo disso a taxa de pontualidade representa poucas entregas -- aviso
// de QUALIDADE DO DADO (nao uma meta de negocio).
export const LOW_COVERAGE_PERCENT = 50;

// BI 3 -- painel de pontualidade (on_time_delivery_rate). Extraido da aba
// Operacao no BI 6 para reuso na aba Prazos: mesmo componente, mesmo KPI,
// nenhuma segunda formula.
export function OnTimePanel({
  kpi,
  onExplain,
}: {
  kpi: KpiResultEntity | undefined;
  onExplain: (kpi: KpiResultEntity) => void;
}): JSX.Element | null {
  if (!kpi) return null;
  const coverage = findInput(kpi, 'coverage');
  const onTime = findInput(kpi, 'onTimeDeliveries');
  const withDeadline = findInput(kpi, 'deliveriesWithDeadline');
  const completed = findInput(kpi, 'completedDeliveries');

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Pontualidade"
        description="Entregas concluídas que chegaram até a previsão informada."
        action={
          <button
            type="button"
            onClick={() => onExplain(kpi)}
            className="text-xs font-medium text-violet-700 hover:text-violet-900"
            aria-label={`Como é calculado: ${kpi.name}`}
          >
            Como é calculado
          </button>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
        {kpi.value === null ? (
          <p className="text-sm text-warning-700">{kpi.unavailableReason}</p>
        ) : (
          <>
            <RadialGauge percentage={kpi.value} size={112} tone="brand" centerValue={formatKpiValue('PERCENT', kpi.value)} />
            <div className="flex flex-1 flex-col gap-2 text-sm">
              <KpiTrend kpi={kpi} />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-ink-muted">No prazo</dt>
                <dd className="text-right font-medium tabular-nums text-ink">{formatNumber(onTime)}</dd>
                <dt className="text-ink-muted">Com previsão</dt>
                <dd className="text-right font-medium tabular-nums text-ink">{formatNumber(withDeadline)}</dd>
                <dt className="text-ink-muted">Concluídas</dt>
                <dd className="text-right font-medium tabular-nums text-ink">{formatNumber(completed)}</dd>
              </dl>
            </div>
          </>
        )}
      </CardBody>
      {coverage !== null && (
        <div className="border-t border-border px-5 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Cobertura da métrica</span>
            <span className="font-medium tabular-nums text-ink">{formatKpiValue('PERCENT', coverage)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={coverage < LOW_COVERAGE_PERCENT ? 'h-full bg-warning-500' : 'h-full bg-info-500'}
              style={{ width: `${Math.min(100, coverage)}%` }}
            />
          </div>
          {coverage < LOW_COVERAGE_PERCENT && (
            <p className="mt-1.5 text-xs text-warning-700">
              Poucas entregas têm previsão de chegada informada: a taxa representa só parte das entregas.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
