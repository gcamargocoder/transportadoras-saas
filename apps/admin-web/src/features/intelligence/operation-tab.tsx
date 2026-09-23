'use client';

import { AlertOctagon, AlertTriangle, Gauge, Milestone, PackageCheck, Route as RouteIcon, Timer, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { RadialGauge } from '../../components/ui/radial-gauge';
import type { KpiResultEntity } from '../../types/entities';
import { formatNumber } from '../../utils/format';
import { FleetTimeBand } from './fleet-time-band';
import { KpiCard, KpiTrend } from './kpi-card';
import { findInput, formatKpiValue } from './kpi-format';
import { PeriodComparisonChart } from './period-comparison-chart';

// Abaixo disso a taxa de pontualidade representa poucas entregas -- aviso
// de QUALIDADE DO DADO (nao uma meta de negocio).
const LOW_COVERAGE_PERCENT = 50;

function Block({ title, description, children }: { title: string; description: string; children: ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function OnTimePanel({ kpi, onExplain }: { kpi: KpiResultEntity | undefined; onExplain: (kpi: KpiResultEntity) => void }): JSX.Element | null {
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

export function OperationTab({
  kpis,
  onExplain,
}: {
  kpis: Map<string, KpiResultEntity>;
  onExplain: (kpi: KpiResultEntity) => void;
}): JSX.Element {
  const card = (id: string, icon: typeof RouteIcon) => {
    const kpi = kpis.get(id);
    return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
  };
  const volumeKpis = ['trips_completed', 'deliveries_completed']
    .map((id) => kpis.get(id))
    .filter((kpi): kpi is KpiResultEntity => kpi !== undefined);
  const occurrenceKpis = ['occurrences_total', 'occurrences_critical']
    .map((id) => kpis.get(id))
    .filter((kpi): kpi is KpiResultEntity => kpi !== undefined);

  return (
    <div className="flex flex-col gap-10">
      <Block title="Viagens e entregas" description="Volume concluído no período e cumprimento das previsões de chegada.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {card('trips_completed', RouteIcon)}
          {card('deliveries_completed', PackageCheck)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Comparação com o período anterior" description="Viagens e entregas concluídas." />
            <CardBody>
              <PeriodComparisonChart kpis={volumeKpis} ariaLabel="Viagens e entregas concluídas: período atual e anterior" />
            </CardBody>
          </Card>
          <OnTimePanel kpi={kpis.get('on_time_delivery_rate')} onExplain={onExplain} />
        </div>
      </Block>

      <Block title="Distância e tempo da frota" description="Quilometragem rodada e como as horas dos veículos foram usadas.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {card('distance_km', Milestone)}
          {card('fleet_utilization', Gauge)}
          {card('fleet_availability', Wrench)}
          {card('idle_hours', Timer)}
        </div>
        {kpis.get('fleet_utilization')?.value != null && (
          <Card>
            <CardHeader title="Horas da frota no período" description="Distribuição da capacidade dos veículos em operação." />
            <CardBody>
              <FleetTimeBand kpi={kpis.get('fleet_utilization')} />
            </CardBody>
          </Card>
        )}
      </Block>

      <Block title="Ocorrências" description="Registros de ocorrências nas viagens, exceto as canceladas.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {card('occurrences_total', AlertTriangle)}
          {card('occurrences_critical', AlertOctagon)}
          <Card>
            <CardHeader title="Comparação com o período anterior" />
            <CardBody>
              <PeriodComparisonChart kpis={occurrenceKpis} ariaLabel="Ocorrências totais e críticas: período atual e anterior" />
            </CardBody>
          </Card>
        </div>
      </Block>
    </div>
  );
}
