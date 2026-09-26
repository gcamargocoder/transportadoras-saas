'use client';

import { useQuery } from '@tanstack/react-query';
import { Gauge, Milestone, Route as RouteIcon, Timer, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFleets } from '../../lib/api/fleet.api';
import type { FleetEntity, KpiGranularity, KpiResultEntity, VehicleEntity } from '../../types/entities';
import { TrendLineChart } from './financial-charts';
import { FleetTimeBand } from './fleet-time-band';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import { FleetVehicleTable } from './fleet-vehicle-table';
import { KpiCard } from './kpi-card';
import { indexKpis } from './kpi-format';
import type { PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows } from './series-format';

const SUMMARY_KPIS = ['fleet_utilization', 'fleet_availability', 'idle_hours', 'trips_completed', 'distance_km'];
const TREND_KPIS = ['fleet_utilization', 'fleet_availability', 'idle_hours', 'trips_completed'];

function Block({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function GranularityControl({
  value,
  range,
  onChange,
}: {
  value: KpiGranularity;
  range: PeriodRange;
  onChange: (value: KpiGranularity) => void;
}): JSX.Element {
  const options: KpiGranularity[] = ['day', 'week', 'month'];
  return (
    <div role="radiogroup" aria-label="Agrupar evolução por" className="flex rounded-lg border border-border bg-surface-muted p-0.5">
      {options.map((option) => {
        const allowed = isGranularityAllowed(option, range.startDate, range.endDate);
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            disabled={!allowed}
            title={allowed ? undefined : 'Período longo demais para esse agrupamento'}
            onClick={() => onChange(option)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 ${
              value === option ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {GRANULARITY_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

// BI 4 -- filtro local a ESTA aba (a Central hoje nao tem filtro de
// veiculo/frota em nenhum lugar). Sem selecao, reaproveita o summary global
// da pagina (mesmo dado de Visao geral/Operacao); com selecao, dispara UM
// summary adicional escopado -- nunca uma segunda formula, so um `vehicleId`/
// `fleetId` a mais no MESMO GET /bi/kpis/summary.
export function FleetTab({
  kpis,
  range,
  granularity,
  onGranularityChange,
  onExplain,
}: {
  kpis: Map<string, KpiResultEntity>;
  range: PeriodRange;
  granularity: KpiGranularity | null;
  onGranularityChange: (value: KpiGranularity) => void;
  onExplain: (kpi: KpiResultEntity) => void;
}): JSX.Element {
  const [vehicle, setVehicle] = useState<VehicleEntity | null>(null);
  const [fleetId, setFleetId] = useState('');
  const hasFilter = Boolean(vehicle || fleetId);
  const requestedGranularity = granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;

  const scopedSummary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'fleet-scope', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSummary({ ...range, kpis: SUMMARY_KPIS.join(','), vehicleId: vehicle?.id, fleetId: fleetId || undefined }, signal),
    enabled: hasFilter,
    staleTime: 60_000,
  });
  const activeKpis = hasFilter ? indexKpis(scopedSummary.data?.kpis) : kpis;

  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'fleet', range, requestedGranularity ?? 'auto', vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSeries(
        { ...range, kpis: TREND_KPIS.join(','), granularity: requestedGranularity, comparison: 'PREVIOUS_PERIOD', vehicleId: vehicle?.id, fleetId: fleetId || undefined },
        signal,
      ),
    staleTime: 60_000,
  });
  const seriesData = series.data;
  const effectiveGranularity = seriesData?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((seriesData?.series ?? []).map((s) => [s.id, s]));
  const pointCount = seriesData?.series[0]?.points.length ?? 0;

  const card = (id: string, icon: typeof RouteIcon) => {
    const kpi = activeKpis.get(id);
    return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
  };

  return (
    <div className="flex flex-col gap-10">
      <Block
        title="Filtro da frota"
        description="Restringe os indicadores desta aba a um veículo ou frota. Sem seleção, mostra a frota inteira."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <FleetVehiclePicker
              selectedVehicle={vehicle}
              onSelect={(v) => {
                setVehicle(v);
                setFleetId('');
              }}
              onClear={() => setVehicle(null)}
            />
            <EntitySelect<FleetEntity>
              queryKey={['fleets', 'picker']}
              queryFn={() => listFleets({ pageSize: 100 })}
              getOptionValue={(f) => f.id}
              getOptionLabel={(f) => f.name}
              value={fleetId}
              onChange={(value) => {
                setFleetId(value);
                setVehicle(null);
              }}
              placeholder="Todas as frotas"
              disabled={Boolean(vehicle)}
            />
          </div>
        }
      >
        <></>
      </Block>

      <Block title="Resumo da frota" description="Utilização, disponibilidade, ociosidade, viagens e distância no período.">
        {hasFilter && scopedSummary.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-busy="true" aria-label="Carregando indicadores da frota">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {hasFilter && scopedSummary.isError && (
          <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />
        )}
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {card('fleet_utilization', Gauge)}
            {card('fleet_availability', Wrench)}
            {card('idle_hours', Timer)}
            {card('trips_completed', RouteIcon)}
            {card('distance_km', Milestone)}
          </div>
        )}
      </Block>

      <Block
        title="Evolução da frota"
        description="Cada ponto usa o mesmo cálculo dos indicadores acima, aplicado ao intervalo."
        action={<GranularityControl value={effectiveGranularity} range={range} onChange={onGranularityChange} />}
      >
        {series.isLoading && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando evolução da frota">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full" />
            ))}
          </div>
        )}
        {series.isError && <ErrorState title="Não foi possível carregar a evolução." onRetry={() => series.refetch()} />}
        {seriesData && pointCount < 2 && (
          <EmptyState title="Período curto demais para mostrar evolução" description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor." />
        )}
        {seriesData && pointCount >= 2 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {TREND_KPIS.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              return (
                <Card key={id}>
                  <CardHeader title={s.name} />
                  <CardBody>
                    <TrendLineChart rows={toSeriesRows(s, effectiveGranularity)} unit={s.unit} name={s.name} showPrevious />
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
        {seriesData && seriesData.series.some((s) => s.points.some((p) => p.partial)) && (
          <p className="text-xs text-ink-subtle">
            Intervalos marcados como incompletos começaram antes do período ou ainda estão em andamento.
          </p>
        )}
      </Block>

      <Block
        title="Composição do tempo da frota"
        description="Como as horas dos veículos no escopo se distribuíram: viagem, manutenção, ociosidade e o que não tem registro suficiente para ser classificado."
      >
        {hasFilter && scopedSummary.isLoading && (
          <Skeleton className="h-40 w-full" aria-label="Carregando composição do tempo" />
        )}
        {hasFilter && scopedSummary.isError && (
          <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />
        )}
        {(!hasFilter || scopedSummary.data) &&
          (activeKpis.get('fleet_utilization')?.value != null ? (
            <Card>
              <CardBody>
                <FleetTimeBand kpi={activeKpis.get('fleet_utilization')} />
              </CardBody>
            </Card>
          ) : (
            <EmptyState
              title="Sem dado de tempo de frota no período"
              description="Nenhum veículo com capacidade calculável no escopo e período selecionados."
            />
          ))}
      </Block>

      <Block
        title="Desempenho por veículo"
        description="Utilização, disponibilidade, ociosidade, viagens e distância de cada veículo do escopo. Ordene ou busque para investigar — não é um ranking."
      >
        {vehicle ? (
          <EmptyState
            title="Filtro já restrito a 1 veículo"
            description="Limpe o filtro de veículo acima para comparar todos os veículos da frota."
          />
        ) : (
          <FleetVehicleTable range={range} fleetId={fleetId || null} />
        )}
      </Block>
    </div>
  );
}
