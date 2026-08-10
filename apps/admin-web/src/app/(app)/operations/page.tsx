'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '../../../components/ui/badge';
import { DataTable } from '../../../components/ui/data-table';
import { PageHeader } from '../../../components/ui/page-header';
import { Tabs } from '../../../components/ui/tabs';
import { getActiveOperations } from '../../../lib/api/trips.api';
import { TRIP_STATUS_LABELS } from '../../../lib/labels';
import { RECONCILIATION_STATUS_LABELS, RECONCILIATION_STATUS_TONE } from '../../../features/tolls/reconciliation-verdict';
import {
  LOCATION_FRESHNESS_LABELS,
  LOCATION_FRESHNESS_TONE,
  OPERATIONAL_STATUS_LABELS,
  OPERATIONAL_STATUS_TONE,
} from '../../../features/operations/status';
import { OPERATIONS_POLL_INTERVAL_MS } from '../../../features/operations/constants';
import type { TripOperationEntity } from '../../../types/entities';

type FilterValue = 'all' | 'active' | 'paused' | 'attention' | 'critical';

// Fase 29, secao 19 -- "com atencao" e "criticas" sao derivados no cliente a
// partir dos MESMOS campos ja calculados pelo backend (nunca uma segunda
// formula): desvio em aberto, localizacao desatualizada, pedagio pendente ou
// conciliacao ATTENTION/CRITICAL, alerta de severidade alta/critica.
function needsAttention(item: TripOperationEntity): boolean {
  return (
    item.hasUnresolvedDeviation ||
    item.locationFreshness !== 'ONLINE' ||
    item.tollSummary.pendingCount > 0 ||
    item.tollSummary.reconciliationStatus === 'ATTENTION' ||
    item.tollSummary.reconciliationStatus === 'CRITICAL'
  );
}

function isCritical(item: TripOperationEntity): boolean {
  return (
    item.tollSummary.reconciliationStatus === 'CRITICAL' ||
    item.alerts.some((alert) => alert.severity === 'CRITICAL' || alert.severity === 'HIGH')
  );
}

function formatMinutesAgo(minutes: number | null): string {
  if (minutes === null) return 'nunca';
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `há ${hours}h${remainder.toString().padStart(2, '0')}`;
}

export default function OperationsPage(): JSX.Element {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>('all');

  const query = useQuery({
    queryKey: ['trips', 'operations', 'active'],
    queryFn: ({ signal }) => getActiveOperations(signal),
    // Sem WebSocket/SSE na infraestrutura atual (auditoria da Fase 29):
    // polling eficiente via React Query. refetchIntervalInBackground=false
    // (padrao) ja pausa o polling com a aba invisivel -- nenhum listener de
    // visibilidade manual precisa ser escrito aqui.
    refetchInterval: OPERATIONS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const items = query.data?.items ?? [];

  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((i) => i.status === 'IN_PROGRESS').length,
      paused: items.filter((i) => i.status === 'PAUSED').length,
      attention: items.filter(needsAttention).length,
      critical: items.filter(isCritical).length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case 'active':
        return items.filter((i) => i.status === 'IN_PROGRESS');
      case 'paused':
        return items.filter((i) => i.status === 'PAUSED');
      case 'attention':
        return items.filter(needsAttention);
      case 'critical':
        return items.filter(isCritical);
      default:
        return items;
    }
  }, [items, filter]);

  const columns = useMemo<ColumnDef<TripOperationEntity, unknown>[]>(
    () => [
      {
        header: 'Motorista',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.driverName ?? '-'}</p>
            <p className="text-xs text-ink-subtle">{row.original.vehiclePlate ?? 'Sem veículo'}</p>
          </div>
        ),
      },
      {
        header: 'Origem → Destino',
        cell: ({ row }) => (
          <p className="text-sm text-ink">
            {row.original.originName} → {row.original.destinationName}
          </p>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Badge tone={OPERATIONAL_STATUS_TONE[row.original.operationalStatus]} dot>
              {OPERATIONAL_STATUS_LABELS[row.original.operationalStatus]}
            </Badge>
            <p className="text-xs text-ink-subtle">{TRIP_STATUS_LABELS[row.original.status]}</p>
          </div>
        ),
      },
      {
        header: 'Última atualização',
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Badge tone={LOCATION_FRESHNESS_TONE[row.original.locationFreshness]}>
              {row.original.lastPosition
                ? formatMinutesAgo(row.original.minutesSinceLastUpdate)
                : LOCATION_FRESHNESS_LABELS.OFFLINE}
            </Badge>
          </div>
        ),
      },
      {
        header: 'Rota',
        cell: ({ row }) => {
          const item = row.original;
          if (item.hasUnresolvedDeviation) {
            return <Badge tone="danger">Desvio detectado</Badge>;
          }
          if (item.hasRecalculatedRoute) {
            return <Badge tone="info">Rota recalculada</Badge>;
          }
          if (!item.routePlanId) {
            return <span className="text-xs text-ink-subtle">Sem rota planejada</span>;
          }
          return <Badge tone="success">Na rota</Badge>;
        },
      },
      {
        header: 'Pedágios',
        cell: ({ row }) => {
          const summary = row.original.tollSummary;
          return (
            <div className="flex flex-col gap-1 text-xs text-ink-muted">
              <span>
                {summary.registeredCount}/{summary.plannedCount} registrados
              </span>
              {summary.pendingCount > 0 && <Badge tone="warning">{summary.pendingCount} pendente(s)</Badge>}
              {summary.unplannedCount > 0 && (
                <Badge tone="info">{summary.unplannedCount} não previsto(s)</Badge>
              )}
            </div>
          );
        },
      },
      {
        header: 'Conciliação',
        cell: ({ row }) => (
          <Badge tone={RECONCILIATION_STATUS_TONE[row.original.tollSummary.reconciliationStatus]}>
            {RECONCILIATION_STATUS_LABELS[row.original.tollSummary.reconciliationStatus]}
          </Badge>
        ),
      },
      {
        header: 'Alertas',
        cell: ({ row }) => {
          const count = row.original.alerts.length;
          if (count === 0) return <span className="text-xs text-ink-subtle">-</span>;
          return <Badge tone="danger">{count} alerta{count > 1 ? 's' : ''}</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Monitoramento Operacional"
        description="Viagens em andamento, agora -- posição, rota, pedágios e conciliação."
      />

      <Tabs
        tabs={[
          { value: 'all', label: 'Todas', count: counts.all },
          { value: 'active', label: 'Em viagem', count: counts.active },
          { value: 'paused', label: 'Pausadas', count: counts.paused },
          { value: 'attention', label: 'Com atenção', count: counts.attention },
          { value: 'critical', label: 'Críticas', count: counts.critical },
        ]}
        active={filter}
        onChange={(v) => setFilter(v as FilterValue)}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(item) => router.push(`/trips/${item.tripId}`)}
          getRowId={(item) => item.tripId}
          emptyTitle="Nenhuma viagem nesta situação"
          emptyDescription="Não há viagens ativas para o filtro selecionado no momento."
        />
      </div>
    </div>
  );
}
