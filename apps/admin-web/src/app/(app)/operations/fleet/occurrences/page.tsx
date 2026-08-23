'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { DataTable } from '../../../../../components/ui/data-table';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { listDrivers } from '../../../../../lib/api/drivers.api';
import { getFleetOperationsOccurrences } from '../../../../../lib/api/fleet-operations.api';
import { listVehicles } from '../../../../../lib/api/fleet.api';
import {
  TRIP_OCCURRENCE_SEVERITY_LABELS,
  TRIP_OCCURRENCE_STATUS_LABELS,
  TRIP_OCCURRENCE_TYPE_LABELS,
} from '../../../../../lib/labels';
import type { FleetOccurrenceDriverRankingEntryEntity, FleetOccurrenceTypeCountEntity, FleetOccurrenceSeverityCountEntity } from '../../../../../types/entities';
import type { TripOccurrenceSeverity, TripOccurrenceStatus, TripOccurrenceType } from '../../../../../types/enums';
import { formatNumber } from '../../../../../utils/format';

const TYPE_OPTIONS = Object.entries(TRIP_OCCURRENCE_TYPE_LABELS) as [TripOccurrenceType, string][];
const SEVERITY_OPTIONS = Object.entries(TRIP_OCCURRENCE_SEVERITY_LABELS) as [TripOccurrenceSeverity, string][];
const STATUS_OPTIONS = Object.entries(TRIP_OCCURRENCE_STATUS_LABELS) as [TripOccurrenceStatus, string][];

export default function FleetOccurrencesPage(): JSX.Element {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');

  const filters = {
    from: from || undefined,
    to: to || undefined,
    vehicleId: vehicleId || undefined,
    driverId: driverId || undefined,
    type: (type || undefined) as TripOccurrenceType | undefined,
    severity: (severity || undefined) as TripOccurrenceSeverity | undefined,
    status: (status || undefined) as TripOccurrenceStatus | undefined,
  };
  const hasActiveFilters = Boolean(from || to || vehicleId || driverId || type || severity || status);

  const query = useQuery({
    queryKey: ['fleet-operations', 'occurrences', filters],
    queryFn: ({ signal }) => getFleetOperationsOccurrences(filters, signal),
  });

  const typeColumns = useMemo<ColumnDef<FleetOccurrenceTypeCountEntity, unknown>[]>(
    () => [
      { header: 'Tipo', accessorFn: (row) => TRIP_OCCURRENCE_TYPE_LABELS[row.type] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
    ],
    [],
  );

  const severityColumns = useMemo<ColumnDef<FleetOccurrenceSeverityCountEntity, unknown>[]>(
    () => [
      { header: 'Severidade', accessorFn: (row) => TRIP_OCCURRENCE_SEVERITY_LABELS[row.severity] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
    ],
    [],
  );

  const driverColumns = useMemo<ColumnDef<FleetOccurrenceDriverRankingEntryEntity, unknown>[]>(
    () => [
      { header: 'Motorista', accessorFn: (row) => row.driverName },
      { header: 'Ocorrências', accessorFn: (row) => formatNumber(row.count) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Ocorrências"
        description="Incidentes registrados durante as viagens (acidente, quebra, atraso, desvio de rota, problemas de entrega/documento/veículo/combustível/pneu)."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setFrom('');
          setTo('');
          setVehicleId('');
          setDriverId('');
          setType('');
          setSeverity('');
          setStatus('');
        }}
      >
        <FormField label="De" htmlFor="focc-from">
          <DatePicker id="focc-from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label="Até" htmlFor="focc-to">
          <DatePicker id="focc-to" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <FormField label="Veículo" htmlFor="focc-vehicle" className="w-full sm:w-48">
          <EntitySelect
            id="focc-vehicle"
            queryKey={['vehicles', 'select']}
            queryFn={() => listVehicles({ pageSize: 100 })}
            getOptionValue={(v) => v.id}
            getOptionLabel={(v) => v.plate}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Motorista" htmlFor="focc-driver" className="w-full sm:w-48">
          <EntitySelect
            id="focc-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100 })}
            getOptionValue={(d) => d.id}
            getOptionLabel={(d) => d.name}
            value={driverId}
            onChange={setDriverId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Tipo" htmlFor="focc-type" className="w-full sm:w-48">
          <Select id="focc-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos</option>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Severidade" htmlFor="focc-severity" className="w-full sm:w-40">
          <Select id="focc-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Todas</option>
            {SEVERITY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="focc-status" className="w-full sm:w-40">
          <Select id="focc-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      {query.isLoading && <SkeletonCards count={5} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total" value={formatNumber(query.data.totalCount)} icon={ShieldAlert} />
            <StatCard
              label="Em aberto"
              value={formatNumber(query.data.openCount)}
              icon={AlertTriangle}
              tone={query.data.openCount > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="Críticas em aberto"
              value={formatNumber(query.data.criticalOpenCount)}
              icon={ShieldAlert}
              tone={query.data.criticalOpenCount > 0 ? 'danger' : 'success'}
            />
            <StatCard label="Resolvidas" value={formatNumber(query.data.resolvedCount)} icon={CheckCircle2} tone="success" />
            <StatCard label="Canceladas" value={formatNumber(query.data.cancelledCount)} icon={XCircle} />
          </div>

          <Card>
            <CardHeader title="Por tipo" />
            <DataTable columns={typeColumns} data={query.data.byType} emptyTitle="Sem ocorrências no período/filtro." />
          </Card>

          <Card>
            <CardHeader title="Por severidade" />
            <DataTable columns={severityColumns} data={query.data.bySeverity} emptyTitle="Sem ocorrências no período/filtro." />
          </Card>

          <MonthlyChartCard
            title="Evolução mensal da quantidade de ocorrências"
            data={query.data.monthlyTrend}
            color="#dc2626"
            valueFormatter={(v) => formatNumber(v)}
          />

          <BarRankingChart
            title="Ranking de veículos por ocorrências"
            data={query.data.byVehicle.map((v) => ({ label: v.plate, value: v.count }))}
            color="#dc2626"
            valueFormatter={(v) => formatNumber(v)}
            emptyMessage="Nenhum veículo com ocorrência registrada no período/filtro selecionado."
          />

          <Card>
            <CardHeader title="Ranking de motoristas por ocorrências" />
            <DataTable
              columns={driverColumns}
              data={query.data.byDriver}
              emptyTitle="Nenhum motorista com ocorrência registrada no período/filtro selecionado."
            />
          </Card>
        </div>
      )}
    </div>
  );
}
