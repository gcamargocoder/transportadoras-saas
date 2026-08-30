'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Clock, PackageCheck, Route as RouteIcon, ShieldAlert, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { DataTable } from '../../../../components/ui/data-table';
import { DatePicker } from '../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../components/ui/entity-select';
import { FilterBar } from '../../../../components/ui/filter-bar';
import { FormField } from '../../../../components/ui/form-field';
import { PageHeader } from '../../../../components/ui/page-header';
import { Select } from '../../../../components/ui/select';
import { StatCard } from '../../../../components/ui/stat-card';
import { Tabs } from '../../../../components/ui/tabs';
import { OPERATIONS_POLL_INTERVAL_MS } from '../../../../features/operations/constants';
import {
  LOCATION_FRESHNESS_LABELS,
  LOCATION_FRESHNESS_TONE,
  OPERATIONAL_STATUS_LABELS,
  OPERATIONAL_STATUS_TONE,
} from '../../../../features/operations/status';
import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUS_TONE,
  TRIP_PRIORITY_TONE,
} from '../../../../features/trips/status';
import { RECONCILIATION_STATUS_TONE } from '../../../../features/tolls/reconciliation-verdict';
import { listDrivers } from '../../../../lib/api/drivers.api';
import { listVehicles } from '../../../../lib/api/fleet.api';
import { getActiveOperations } from '../../../../lib/api/trips.api';
import { TRIP_PRIORITY_LABELS, TRIP_STATUS_LABELS } from '../../../../lib/labels';
import type { TripOperationEntity } from '../../../../types/entities';
import type { TripPriority } from '../../../../types/enums';
import { formatDateTime } from '../../../../utils/format';

// Fase 105 -- Torre de Controle Operacional. Auditoria previa confirmou que
// o painel de monitoramento (Fase 29, GET /trips/operations/active,
// pagina /operations) ja cobre a maior parte do pedido -- viagens em
// andamento, situacao atual, veiculo/motorista, origem/destino, alertas,
// pedagio/conciliacao, atualizacao via polling (mesmo mecanismo reaproveitado
// aqui, nunca um segundo sistema de tempo real). As lacunas reais (entregas
// pendentes/concluidas/com falha, ocorrencias criticas, atraso vs previsao)
// foram fechadas ENRIQUECENDO o MESMO endpoint/entidade (TripOperationEntity),
// nunca duplicando a consulta -- ver TripsService.getActiveOperations. Esta
// pagina e uma apresentacao mais completa (indicadores + filtros adicionais +
// links rapidos) do MESMO dado ja usado por /operations; a pagina de
// Monitoramento original permanece inalterada.
type FilterValue = 'all' | 'delayed' | 'critical' | 'intervention';

function needsIntervention(item: TripOperationEntity): boolean {
  return (
    item.hasUnresolvedDeviation ||
    item.criticalOpenOccurrencesCount > 0 ||
    item.isDelayed ||
    item.deliverySummary.failedCount > 0 ||
    item.locationFreshness === 'OFFLINE' ||
    item.tollSummary.reconciliationStatus === 'ATTENTION' ||
    item.tollSummary.reconciliationStatus === 'CRITICAL' ||
    item.alerts.some((alert) => alert.severity === 'CRITICAL' || alert.severity === 'HIGH') ||
    // Fase 111 -- checklist pre-viagem concluido com item critico marcado
    // NAO tambem exige intervencao, mesmo criterio dos demais sinais acima.
    item.preTripChecklistHasCriticalNonConformity ||
    // Fase 114 -- manutencao preventiva vencida do veiculo em viagem agora
    // tambem e um sinal real de risco operacional (mesmo evaluateMaintenancePlan
    // ja usado no dashboard de frota), nao so um dado informativo.
    item.maintenanceStatus === 'OVERDUE'
  );
}

export default function ControlTowerPage(): JSX.Element {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>('all');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [priority, setPriority] = useState<TripPriority | ''>('');
  const [arrivalFrom, setArrivalFrom] = useState('');
  const [arrivalTo, setArrivalTo] = useState('');
  const hasActiveFilters = Boolean(vehicleId || driverId || priority || arrivalFrom || arrivalTo);

  const query = useQuery({
    queryKey: ['trips', 'operations', 'active'],
    queryFn: ({ signal }) => getActiveOperations(signal),
    refetchInterval: OPERATIONS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const items = query.data?.items ?? [];

  // Filtros de veiculo/motorista/periodo aplicados EM MEMORIA sobre a MESMA
  // lista ja carregada (mesmo principio ja usado pelas abas de status desta
  // pagina e da pagina de Monitoramento) -- a lista de operacoes ativas e
  // naturalmente pequena (so viagens nao terminadas), nunca justificando uma
  // segunda consulta ao backend so para filtrar.
  const filteredByDimension = useMemo(() => {
    return items.filter((item) => {
      if (vehicleId && item.vehicleId !== vehicleId) return false;
      if (driverId && item.driverId !== driverId) return false;
      if (priority && item.priority !== priority) return false;
      if (arrivalFrom && (!item.plannedArrival || item.plannedArrival < arrivalFrom)) return false;
      if (arrivalTo && (!item.plannedArrival || item.plannedArrival > `${arrivalTo}T23:59:59.999Z`)) return false;
      return true;
    });
  }, [items, vehicleId, driverId, priority, arrivalFrom, arrivalTo]);

  const counts = useMemo(
    () => ({
      all: filteredByDimension.length,
      delayed: filteredByDimension.filter((i) => i.isDelayed).length,
      critical: filteredByDimension.filter((i) => i.criticalOpenOccurrencesCount > 0).length,
      intervention: filteredByDimension.filter(needsIntervention).length,
    }),
    [filteredByDimension],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case 'delayed':
        return filteredByDimension.filter((i) => i.isDelayed);
      case 'critical':
        return filteredByDimension.filter((i) => i.criticalOpenOccurrencesCount > 0);
      case 'intervention':
        return filteredByDimension.filter(needsIntervention);
      default:
        return filteredByDimension;
    }
  }, [filteredByDimension, filter]);

  const summary = useMemo(
    () => ({
      failedDeliveries: filteredByDimension.reduce((sum, i) => sum + i.deliverySummary.failedCount, 0),
      pendingDeliveries: filteredByDimension.reduce((sum, i) => sum + i.deliverySummary.pendingCount + i.deliverySummary.inProgressCount, 0),
      openAlerts: filteredByDimension.reduce((sum, i) => sum + i.alerts.length, 0),
      overdueMaintenance: filteredByDimension.filter((i) => i.maintenanceStatus === 'OVERDUE').length,
    }),
    [filteredByDimension],
  );

  const columns = useMemo<ColumnDef<TripOperationEntity, unknown>[]>(
    () => [
      {
        header: 'Motorista / Veículo',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.driverName ?? '—'}</p>
            <p className="text-xs text-ink-subtle">{row.original.vehiclePlate ?? 'Sem veículo'}</p>
          </div>
        ),
      },
      {
        header: 'Origem → Destino',
        cell: ({ row }) => (
          <div>
            <p className="text-sm text-ink">
              {row.original.originName} → {row.original.destinationName}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <p className="text-xs text-ink-subtle">{TRIP_STATUS_LABELS[row.original.status]}</p>
              {row.original.priority !== 'NORMAL' && (
                <Badge tone={TRIP_PRIORITY_TONE[row.original.priority]}>
                  {TRIP_PRIORITY_LABELS[row.original.priority]}
                </Badge>
              )}
            </div>
          </div>
        ),
      },
      {
        header: 'Situação',
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Badge tone={OPERATIONAL_STATUS_TONE[row.original.operationalStatus]} dot>
              {OPERATIONAL_STATUS_LABELS[row.original.operationalStatus]}
            </Badge>
            <Badge tone={LOCATION_FRESHNESS_TONE[row.original.locationFreshness]}>
              {LOCATION_FRESHNESS_LABELS[row.original.locationFreshness]}
            </Badge>
          </div>
        ),
      },
      {
        header: 'Previsão de chegada',
        cell: ({ row }) => (
          <div>
            <p className="text-sm text-ink">{row.original.plannedArrival ? formatDateTime(row.original.plannedArrival) : '—'}</p>
            {row.original.isDelayed && <Badge tone="danger">Atrasada</Badge>}
          </div>
        ),
      },
      {
        header: 'Entregas',
        cell: ({ row }) => {
          const d = row.original.deliverySummary;
          if (d.totalCount === 0) return <span className="text-xs text-ink-subtle">Sem entregas planejadas</span>;
          return (
            <div className="flex flex-wrap gap-1">
              <Badge tone="success">{d.completedCount} concluída(s)</Badge>
              {d.pendingCount + d.inProgressCount > 0 && <Badge tone="info">{d.pendingCount + d.inProgressCount} pendente(s)</Badge>}
              {d.failedCount > 0 && <Badge tone="danger">{d.failedCount} falha(s)</Badge>}
            </div>
          );
        },
      },
      {
        header: 'Ocorrências',
        cell: ({ row }) => {
          const o = row.original;
          if (o.openOccurrencesCount === 0) return <span className="text-xs text-ink-subtle">Nenhuma</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {o.criticalOpenOccurrencesCount > 0 && (
                <Badge tone="danger">{o.criticalOpenOccurrencesCount} crítica(s)</Badge>
              )}
              <Badge tone="warning">{o.openOccurrencesCount} em aberto</Badge>
            </div>
          );
        },
      },
      {
        header: 'Manutenção',
        cell: ({ row }) => {
          const status = row.original.maintenanceStatus;
          if (status === 'UNKNOWN') return <span className="text-xs text-ink-subtle">—</span>;
          return <Badge tone={MAINTENANCE_STATUS_TONE[status]}>{MAINTENANCE_STATUS_LABELS[status]}</Badge>;
        },
      },
      {
        header: 'Checklist pré-viagem',
        cell: ({ row }) => {
          const status = row.original.preTripChecklistStatus;
          if (row.original.preTripChecklistHasCriticalNonConformity) {
            return <Badge tone="danger">Item crítico</Badge>;
          }
          if (status === 'COMPLETED') return <Badge tone="success">Concluído</Badge>;
          if (status === 'IN_PROGRESS' || status === 'DRAFT') return <Badge tone="warning">Pendente</Badge>;
          return <span className="text-xs text-ink-subtle">—</span>;
        },
      },
      {
        header: 'Alertas',
        cell: ({ row }) => {
          const count = row.original.alerts.length;
          if (count === 0) return <span className="text-xs text-ink-subtle">—</span>;
          return (
            <Badge tone="danger">
              {count} alerta{count > 1 ? 's' : ''}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {row.original.driverId && (
              <Link
                href={`/drivers/${row.original.driverId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-brand-600 hover:underline"
              >
                Motorista
              </Link>
            )}
            {row.original.vehicleId && (
              <Link
                href={`/vehicles/${row.original.vehicleId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-brand-600 hover:underline"
              >
                Veículo
              </Link>
            )}
            <Link
              href={`/trips/${row.original.tripId}?tab=delivery-stops`}
              onClick={(e) => e.stopPropagation()}
              className="text-brand-600 hover:underline"
            >
              Entregas
            </Link>
            <Link
              href={`/trips/${row.original.tripId}?tab=occurrences`}
              onClick={(e) => e.stopPropagation()}
              className="text-brand-600 hover:underline"
            >
              Ocorrências
            </Link>
            <Link
              href={`/trips/${row.original.tripId}?tab=fiscal`}
              onClick={(e) => e.stopPropagation()}
              className="text-brand-600 hover:underline"
            >
              Documentos
            </Link>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Torre de Controle"
        description="Acompanhamento em tempo real das viagens em andamento — situação, entregas, ocorrências críticas e atrasos, para identificar rapidamente o que exige intervenção."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Viagens em andamento" value={String(counts.all)} icon={RouteIcon} tone="info" />
        <StatCard label="Atrasadas" value={String(counts.delayed)} icon={Clock} tone={counts.delayed > 0 ? 'danger' : 'success'} />
        <StatCard label="Com ocorrência crítica" value={String(counts.critical)} icon={ShieldAlert} tone={counts.critical > 0 ? 'danger' : 'success'} />
        <StatCard
          label="Exigem intervenção"
          value={String(counts.intervention)}
          icon={AlertTriangle}
          tone={counts.intervention > 0 ? 'danger' : 'success'}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Entregas com falha" value={String(summary.failedDeliveries)} icon={PackageCheck} tone={summary.failedDeliveries > 0 ? 'warning' : 'success'} />
        <StatCard label="Entregas pendentes/em andamento" value={String(summary.pendingDeliveries)} icon={PackageCheck} />
        <StatCard label="Alertas em aberto" value={String(summary.openAlerts)} icon={Truck} tone={summary.openAlerts > 0 ? 'warning' : 'success'} />
        <StatCard label="Manutenção vencida" value={String(summary.overdueMaintenance)} icon={Truck} tone={summary.overdueMaintenance > 0 ? 'danger' : 'success'} />
      </div>

      <div className="mt-6">
        <Tabs
          tabs={[
            { value: 'all', label: 'Todas', count: counts.all },
            { value: 'delayed', label: 'Atrasadas', count: counts.delayed },
            { value: 'critical', label: 'Ocorrência crítica', count: counts.critical },
            { value: 'intervention', label: 'Exigem intervenção', count: counts.intervention },
          ]}
          active={filter}
          onChange={(v) => setFilter(v as FilterValue)}
        />
      </div>

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setVehicleId('');
          setDriverId('');
          setPriority('');
          setArrivalFrom('');
          setArrivalTo('');
        }}
      >
        <FormField label="Veículo" htmlFor="control-tower-vehicle" className="w-full sm:w-44">
          <EntitySelect
            id="control-tower-vehicle"
            queryKey={['vehicles', 'select']}
            queryFn={() => listVehicles({ pageSize: 100 })}
            getOptionValue={(v) => v.id}
            getOptionLabel={(v) => v.plate}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Motorista" htmlFor="control-tower-driver" className="w-full sm:w-44">
          <EntitySelect
            id="control-tower-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100 })}
            getOptionValue={(d) => d.id}
            getOptionLabel={(d) => d.name}
            value={driverId}
            onChange={setDriverId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Prioridade" htmlFor="control-tower-priority" className="w-full sm:w-36">
          <Select
            id="control-tower-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TripPriority | '')}
          >
            <option value="">Todas</option>
            {Object.entries(TRIP_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Chegada prevista de" htmlFor="control-tower-arrival-from" className="w-full sm:w-40">
          <DatePicker id="control-tower-arrival-from" value={arrivalFrom} onChange={(e) => setArrivalFrom(e.target.value)} />
        </FormField>
        <FormField label="Chegada prevista até" htmlFor="control-tower-arrival-to" className="w-full sm:w-40">
          <DatePicker id="control-tower-arrival-to" value={arrivalTo} onChange={(e) => setArrivalTo(e.target.value)} />
        </FormField>
      </FilterBar>

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
      <p className="mt-2 text-xs text-ink-subtle">
        Atualiza automaticamente a cada {OPERATIONS_POLL_INTERVAL_MS / 1000} segundos. Conciliação de pedágio:{' '}
        {(['PENDING', 'CONFORM', 'ATTENTION', 'CRITICAL', 'UNVERIFIABLE'] as const).map((s) => (
          <Badge key={s} tone={RECONCILIATION_STATUS_TONE[s]} className="ml-1">
            {s}
          </Badge>
        ))}
      </p>
    </div>
  );
}
