'use client';

import { AlertOctagon, AlertTriangle, PackageCheck, Route as RouteIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import type { KpiResultEntity } from '../../types/entities';
import { KpiCard } from './kpi-card';
import { OnTimePanel } from './on-time-panel';
import { PeriodComparisonChart } from './period-comparison-chart';

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
