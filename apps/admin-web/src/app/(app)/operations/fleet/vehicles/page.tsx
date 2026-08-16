'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Calendar, CircleDot, Gauge, Route as RouteIcon, Sparkles, Truck, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { RadialGauge } from '../../../../../components/ui/radial-gauge';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { RankingCard } from '../../../../../features/fleet-operations/ranking-card';
import { listFleets } from '../../../../../lib/api/fleet.api';
import { getFleetOperationsVehicles } from '../../../../../lib/api/fleet-operations.api';
import { VEHICLE_FUEL_TYPE_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../../../../lib/labels';
import type { FleetVehicleFleetBreakdownEntity, FleetVehicleStatusBreakdownEntity } from '../../../../../types/entities';
import type { VehicleStatus, VehicleType } from '../../../../../types/enums';
import { formatNumber } from '../../../../../utils/format';

function nullableMetric(entry: { value: number | null; available: boolean }, suffix = ''): string {
  return entry.available && entry.value !== null ? `${formatNumber(entry.value, 0)}${suffix}` : 'Indisponível';
}

export default function FleetVehiclesOverviewPage(): JSX.Element {
  const [fleetId, setFleetId] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | ''>('');

  const filters = { fleetId: fleetId || undefined, vehicleType: vehicleType || undefined, vehicleStatus: vehicleStatus || undefined };
  const hasActiveFilters = Boolean(fleetId || vehicleType || vehicleStatus);

  const query = useQuery({
    queryKey: ['fleet-operations', 'vehicles', filters],
    queryFn: ({ signal }) => getFleetOperationsVehicles(filters, signal),
  });

  const statusColumns = useMemo<ColumnDef<FleetVehicleStatusBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Status', accessorFn: (row) => VEHICLE_STATUS_LABELS[row.status] },
      { header: 'Veículos', accessorFn: (row) => formatNumber(row.count) },
    ],
    [],
  );

  const fleetColumns = useMemo<ColumnDef<FleetVehicleFleetBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Frota', accessorFn: (row) => row.fleetName },
      { header: 'Veículos', accessorFn: (row) => formatNumber(row.count) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Veículos e frota — visão geral"
        description="Composição atual da frota por tipo, status, combustível e frota. Não considera período — é uma foto do estado atual."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setFleetId('');
          setVehicleType('');
          setVehicleStatus('');
        }}
      >
        <FormField label="Frota" htmlFor="fveh-fleet" className="w-full sm:w-48">
          <EntitySelect
            id="fveh-fleet"
            queryKey={['fleets', 'select']}
            queryFn={() => listFleets({ pageSize: 100 })}
            getOptionValue={(f) => f.id}
            getOptionLabel={(f) => f.name}
            value={fleetId}
            onChange={setFleetId}
            placeholder="Todas"
          />
        </FormField>
        <FormField label="Tipo" htmlFor="fveh-type" className="w-full sm:w-48">
          <Select id="fveh-type" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType | '')}>
            <option value="">Todos</option>
            {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
              <option key={t} value={t}>
                {VEHICLE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="fveh-status" className="w-full sm:w-48">
          <Select id="fveh-status" value={vehicleStatus} onChange={(e) => setVehicleStatus(e.target.value as VehicleStatus | '')}>
            <option value="">Todos</option>
            {(Object.keys(VEHICLE_STATUS_LABELS) as VehicleStatus[]).map((s) => (
              <option key={s} value={s}>
                {VEHICLE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de veículos" value={formatNumber(query.data.totalVehicles)} icon={Truck} variant="gradient" />
            <StatCard label="Ativos" value={formatNumber(query.data.activeCount)} tone="success" icon={CircleDot} />
            <StatCard label="Inativos" value={formatNumber(query.data.inactiveCount)} />
            <StatCard
              label="Em manutenção"
              value={formatNumber(query.data.maintenanceCount)}
              icon={Wrench}
              tone={query.data.maintenanceCount > 0 ? 'warning' : 'success'}
            />
            <StatCard label="Vendidos" value={formatNumber(query.data.soldCount)} />
            <StatCard label="Em viagem" value={formatNumber(query.data.vehiclesOnTrip)} icon={RouteIcon} tone="info" />
            <StatCard label="Idade média" value={nullableMetric(query.data.averageAgeYears, ' anos')} icon={Calendar} />
            <StatCard label="Odômetro médio" value={nullableMetric(query.data.averageOdometerKm, ' km')} icon={Gauge} />
          </div>

          <Card>
            <CardHeader
              title="Disponibilidade"
              description="Veículos ativos sem viagem em andamento agora, prontos para uso."
            />
            <div className="flex items-center gap-6 p-5">
              <RadialGauge
                percentage={query.data.activeCount > 0 ? (query.data.vehiclesAvailable / query.data.activeCount) * 100 : 0}
                size={100}
              />
              <div className="text-sm text-ink-muted">
                <p className="text-2xl font-semibold text-ink">{formatNumber(query.data.vehiclesAvailable)}</p>
                <p>de {formatNumber(query.data.activeCount)} veículos ativos disponíveis agora.</p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Por tipo"
              data={query.data.byType.map((t) => ({ label: VEHICLE_TYPE_LABELS[t.type], value: t.count }))}
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhum veículo no filtro selecionado."
            />
            <BarRankingChart
              title="Por combustível"
              data={query.data.byFuelType.map((f) => ({ label: f.fuelType ? VEHICLE_FUEL_TYPE_LABELS[f.fuelType] : 'Não informado', value: f.count }))}
              color="#0891b2"
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhum veículo no filtro selecionado."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Por status" />
              <DataTable columns={statusColumns} data={query.data.byStatus} emptyTitle="Nenhum veículo no filtro selecionado." />
            </Card>
            <Card>
              <CardHeader title="Por frota" description='fleetId nulo aparece como "Sem frota".' />
              <DataTable columns={fleetColumns} data={query.data.byFleet} emptyTitle="Nenhum veículo no filtro selecionado." />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RankingCard
              title="Veículos mais antigos"
              icon={Calendar}
              entries={query.data.oldestVehicles}
              formatValue={(v) => String(v)}
              getHref={(entry) => `/vehicles/${entry.vehicleId}`}
              emptyMessage="Nenhum veículo com ano de fabricação cadastrado."
            />
            <RankingCard
              title="Veículos mais novos"
              icon={Sparkles}
              entries={query.data.newestVehicles}
              formatValue={(v) => String(v)}
              getHref={(entry) => `/vehicles/${entry.vehicleId}`}
              emptyMessage="Nenhum veículo com ano de fabricação cadastrado."
            />
            <RankingCard
              title="Maior odômetro"
              icon={Gauge}
              entries={query.data.topVehiclesByOdometer}
              formatValue={(v) => `${formatNumber(v)} km`}
              getHref={(entry) => `/vehicles/${entry.vehicleId}`}
              emptyMessage="Nenhum veículo com odômetro cadastrado."
            />
          </div>

          <div className="flex justify-end">
            <Link href="/vehicles" className="text-sm font-medium text-brand-600 hover:underline">
              Ver todos os veículos →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
