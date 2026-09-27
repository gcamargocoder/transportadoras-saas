'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Gauge,
  PackageCheck,
  Route as RouteIcon,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiBreakdown } from '../../lib/api/bi.api';
import type { BiAlertEntity, BiAlertSeverity, BiAlertsResponseEntity, KpiResultEntity, KpiUnit } from '../../types/entities';
import { alertSeverityLabel, ALERT_SEVERITY_ICON, ALERT_SEVERITY_OPTIONS, ALERT_SEVERITY_RANK, ALERT_SEVERITY_TONE } from './alert-severity';
import { buildAlertMessage } from './alert-format';
import type { IntelligenceTab } from './intelligence-config';
import { InsightList } from './insight-list';
import { KpiCard } from './kpi-card';
import { formatKpiValue } from './kpi-format';
import type { PeriodRange } from './period';
import { RankedValueList, sortRankedItems } from './ranked-value-list';
import { buildInsights } from './report-insights';

interface Slot {
  id: string;
  icon: LucideIcon;
}

// Visao executiva: 4 indicadores principais (volume e resultado) e 4 de
// eficiencia/qualidade. Todos KPIs oficiais do BI 1.
const PRIMARY: Slot[] = [
  { id: 'trips_completed', icon: RouteIcon },
  { id: 'deliveries_completed', icon: PackageCheck },
  { id: 'revenue', icon: CircleDollarSign },
  { id: 'operating_result', icon: Wallet },
];

const SECONDARY: Slot[] = [
  { id: 'cost_per_km', icon: Gauge },
  { id: 'on_time_delivery_rate', icon: Clock },
  { id: 'occurrences_total', icon: AlertTriangle },
  { id: 'idle_hours', icon: Timer },
];

export const OVERVIEW_KPI_IDS = [...PRIMARY, ...SECONDARY].map((slot) => slot.id);

// BI 11 -- KPIs oficiais que ja suportam breakdown?dimension=vehicle (BI 4-8):
// unico criterio para a "sequencia de investigacao" do alerta mais relevante
// mostrar "onde esta concentrado" (nunca a causa).
const VEHICLE_BREAKDOWN_UNIT: Partial<Record<string, KpiUnit>> = {
  cost_per_km: 'BRL_PER_KM',
  on_time_delivery_rate: 'PERCENT',
  trips_completed: 'COUNT',
  deliveries_completed: 'COUNT',
  occurrences_total: 'COUNT',
  occurrences_critical: 'COUNT',
  fleet_utilization: 'PERCENT',
  fleet_availability: 'PERCENT',
  idle_hours: 'HOURS',
  distance_km: 'KM',
  operating_cost: 'BRL',
};

interface InvestigateLink {
  tab: IntelligenceTab;
  label: string;
  description: string;
  statKpiId?: string;
}

const INVESTIGATE_LINKS: InvestigateLink[] = [
  { tab: 'fleet', label: 'Frota', description: 'Utilização, disponibilidade e ociosidade.', statKpiId: 'fleet_utilization' },
  { tab: 'costs', label: 'Custos', description: 'Composição e custo por km.', statKpiId: 'cost_per_km' },
  { tab: 'deadlines', label: 'Prazos', description: 'Pontualidade e cobertura dos dados.', statKpiId: 'on_time_delivery_rate' },
  { tab: 'occurrences', label: 'Ocorrências', description: 'Mapa, tipos, severidades e por veículo.', statKpiId: 'occurrences_total' },
  { tab: 'comparatives', label: 'Comparativos', description: 'Comparar com outro período ou ano.' },
  { tab: 'reports', label: 'Relatórios', description: 'Relatório gerencial completo, com evidências.' },
];

function AttentionAlertRow({ alert, onExplain }: { alert: BiAlertEntity; onExplain: (kpi: KpiResultEntity) => void }): JSX.Element {
  const Icon = ALERT_SEVERITY_ICON[alert.severity];
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <Icon size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ALERT_SEVERITY_TONE[alert.severity]}>{alertSeverityLabel(alert.severity)}</Badge>
            <span className="text-sm font-medium text-ink">{alert.name}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{buildAlertMessage(alert)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onExplain(alert.kpi)}
        className="shrink-0 text-xs font-medium text-violet-700 hover:text-violet-900"
        aria-label={`Investigar: ${alert.name}`}
      >
        Investigar
      </button>
    </li>
  );
}

// BI 11 -- "O que merece atenção": mesmo /bi/alerts do BI 10, so os 3
// principais (ordenados por severidade). "Ver todos" leva para a aba
// Alertas -- nenhuma segunda regra criada aqui.
function AttentionPanel({
  alerts,
  isLoading,
  isError,
  onRetry,
  onExplain,
  onNavigate,
  range,
}: {
  alerts: BiAlertsResponseEntity | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onExplain: (kpi: KpiResultEntity) => void;
  onNavigate: (tab: IntelligenceTab) => void;
  range: PeriodRange;
}): JSX.Element {
  const items = [...(alerts?.items ?? [])].sort((a, b) => ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity]);
  const top = items.slice(0, 3);
  const counts: Record<BiAlertSeverity, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const item of items) counts[item.severity] += 1;

  const topAlert = top[0];
  const breakdownUnit = topAlert ? VEHICLE_BREAKDOWN_UNIT[topAlert.kpi.id] : undefined;
  const topBreakdown = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'overview-attention', topAlert?.kpi.id, range],
    queryFn: ({ signal }) => getKpiBreakdown({ ...range, kpiId: topAlert!.kpi.id, dimension: 'vehicle', limit: 3 }, signal),
    enabled: Boolean(topAlert && breakdownUnit),
    staleTime: 60_000,
  });

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="O que merece atenção"
        description="Alertas determinísticos sobre os KPIs oficiais — nenhuma causalidade inferida."
        action={
          <button type="button" onClick={() => onNavigate('alerts')} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
            Ver todos
            <ArrowRight size={12} aria-hidden />
          </button>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-3">
        {isLoading && <Skeleton className="h-32 w-full" />}
        {isError && <ErrorState title="Não foi possível carregar os alertas." onRetry={onRetry} />}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState icon={CheckCircle2} title="Nenhum alerta no período" description="Os indicadores oficiais estão dentro do esperado." />
        )}
        {!isLoading && !isError && items.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {ALERT_SEVERITY_OPTIONS.map(
                (option) =>
                  counts[option.value] > 0 && (
                    <Badge key={option.value} tone={ALERT_SEVERITY_TONE[option.value]}>
                      {counts[option.value]} {option.label.toLowerCase()}
                    </Badge>
                  ),
              )}
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {top.map((alert) => (
                <AttentionAlertRow key={alert.id} alert={alert} onExplain={onExplain} />
              ))}
            </ul>
            {breakdownUnit && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-ink-subtle">Onde está concentrado — {topAlert!.kpi.name}</p>
                {topBreakdown.isLoading && <Skeleton className="h-20 w-full" />}
                {topBreakdown.data && <RankedValueList unit={breakdownUnit} items={sortRankedItems(topBreakdown.data.items).slice(0, 3)} />}
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

// BI 11 -- "Onde investigar": nao repete as tabelas de Frota/Custos/Prazos/
// Ocorrencias (ja existem); so aponta pra elas com 1 numero oficial ja
// carregado (kpis), sem nenhuma chamada nova.
function InvestigateGrid({ kpis, onNavigate }: { kpis: Map<string, KpiResultEntity>; onNavigate: (tab: IntelligenceTab) => void }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {INVESTIGATE_LINKS.map((link) => {
        const kpi = link.statKpiId ? kpis.get(link.statKpiId) : undefined;
        return (
          <button
            key={link.tab}
            type="button"
            onClick={() => onNavigate(link.tab)}
            className="group flex flex-col items-start gap-1 rounded-lg border border-border bg-white p-4 text-left transition-colors hover:border-brand-300"
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-semibold text-ink">{link.label}</span>
              <ArrowRight size={14} className="text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
            </div>
            <p className="text-xs text-ink-muted">{link.description}</p>
            {kpi && (
              <p className="mt-1 text-sm font-medium tabular-nums text-ink">
                {kpi.value === null ? '—' : formatKpiValue(kpi.unit, kpi.value)}
                <span className="ml-1 text-xs font-normal text-ink-subtle">{kpi.name}</span>
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// BI 11 -- Central de Inteligencia: a Visao geral passa a ser o painel
// executivo (VER -> ENTENDER -> INVESTIGAR). Nenhum KPI/regra/comparacao
// novo -- so orquestra o que ja existe (summary do BI 1, insights do BI 9,
// alertas do BI 10, breakdown do BI 4-8, navegacao entre abas).
export function OverviewTab({
  kpis,
  range,
  alerts,
  alertsLoading,
  alertsError,
  onRetryAlerts,
  onExplain,
  onNavigate,
}: {
  kpis: Map<string, KpiResultEntity>;
  range: PeriodRange;
  alerts: BiAlertsResponseEntity | undefined;
  alertsLoading: boolean;
  alertsError: boolean;
  onRetryAlerts: () => void;
  onExplain: (kpi: KpiResultEntity) => void;
  onNavigate: (tab: IntelligenceTab) => void;
}): JSX.Element {
  const render = (slots: Slot[], size: 'lg' | 'md') =>
    slots.map((slot) => {
      const kpi = kpis.get(slot.id);
      return kpi ? <KpiCard key={slot.id} kpi={kpi} icon={slot.icon} size={size} onExplain={onExplain} /> : null;
    });

  const insights = buildInsights(OVERVIEW_KPI_IDS, kpis);

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Como está a operação" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{render(PRIMARY, 'lg')}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{render(SECONDARY, 'md')}</div>
      </section>

      <section aria-label="O que mudou e o que merece atenção" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader title="O que mudou" description="Leitura das comparações oficiais — nunca assume que aumento é sempre positivo." />
          <CardBody className="flex-1">
            <InsightList insights={insights} onSelect={(id) => { const kpi = kpis.get(id); if (kpi) onExplain(kpi); }} />
          </CardBody>
        </Card>
        <AttentionPanel alerts={alerts} isLoading={alertsLoading} isError={alertsError} onRetry={onRetryAlerts} onExplain={onExplain} onNavigate={onNavigate} range={range} />
      </section>

      <section aria-label="Onde investigar" className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Onde investigar</h2>
          <p className="text-sm text-ink-muted">Cada área tem sua própria investigação completa — evidências, comparativos e concentrações.</p>
        </div>
        <InvestigateGrid kpis={kpis} onNavigate={onNavigate} />
      </section>
    </div>
  );
}
