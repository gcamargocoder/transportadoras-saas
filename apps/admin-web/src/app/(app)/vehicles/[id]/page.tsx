'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody } from '../../../../components/ui/card';
import { DataTable } from '../../../../components/ui/data-table';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { Tabs } from '../../../../components/ui/tabs';
import { useAuth } from '../../../../hooks/use-auth';
import {
  getVehicle,
  getVehicleFuelHistory,
  getVehicleMaintenances,
  getVehicleTags,
} from '../../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { MAINTENANCE_STATUS_TONE, VEHICLE_STATUS_TONE } from '../../../../features/fleet/status';
import { UpdateVehicleModal } from '../../../../features/fleet/update-vehicle-modal';
import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
  VEHICLE_FUEL_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
} from '../../../../lib/labels';
import type {
  FuelSupplyEntity,
  MaintenanceEntity,
  VehicleTagEntity,
} from '../../../../types/entities';
import { formatCurrency, formatDate, formatNumber } from '../../../../utils/format';

type TabValue = 'overview' | 'maintenances' | 'fuel' | 'tags';

export default function VehicleDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { user } = useAuth();
  const [tab, setTab] = useState<TabValue>('overview');
  const [editOpen, setEditOpen] = useState(false);

  const vehicleQuery = useQuery({
    queryKey: ['vehicles', vehicleId],
    queryFn: () => getVehicle(vehicleId),
  });

  const maintenancesQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'maintenances'],
    queryFn: () => getVehicleMaintenances(vehicleId, { pageSize: 50 }),
    enabled: tab === 'maintenances',
  });

  const fuelHistoryQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'fuel-history'],
    queryFn: () => getVehicleFuelHistory(vehicleId, { pageSize: 50 }),
    enabled: tab === 'fuel',
  });

  const tagsQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'tags'],
    queryFn: () => getVehicleTags(vehicleId),
    enabled: tab === 'tags',
  });

  const maintenanceColumns = useMemo<ColumnDef<MaintenanceEntity, unknown>[]>(
    () => [
      { header: 'Tipo', accessorFn: (row) => MAINTENANCE_TYPE_LABELS[row.type] },
      { header: 'Abertura', cell: ({ row }) => formatDate(row.original.openedAt) },
      { header: 'Oficina', accessorFn: (row) => row.workshop ?? '-' },
      { header: 'Custo total', cell: ({ row }) => formatCurrency(row.original.totalCost) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={MAINTENANCE_STATUS_TONE[row.original.status]}>
            {MAINTENANCE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const fuelColumns = useMemo<ColumnDef<FuelSupplyEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.supplyDate) },
      { header: 'Posto', accessorFn: (row) => row.fuelStationName ?? '-' },
      { header: 'Litros', cell: ({ row }) => `${formatNumber(row.original.liters, 1)} L` },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.totalAmount) },
      { header: 'Odômetro', cell: ({ row }) => `${formatNumber(row.original.odometerKm)} km` },
    ],
    [],
  );

  const tagColumns = useMemo<ColumnDef<VehicleTagEntity, unknown>[]>(
    () => [
      { header: 'Número da tag', accessorFn: (row) => row.tagNumber },
      { header: 'Ativa', cell: ({ row }) => (row.original.isActive ? 'Sim' : 'Não') },
      { header: 'Vencimento', cell: ({ row }) => formatDate(row.original.expiresAt) },
    ],
    [],
  );

  if (vehicleQuery.isLoading) return <LoadingState label="Carregando veículo" />;
  if (vehicleQuery.isError || !vehicleQuery.data)
    return <ErrorState onRetry={() => vehicleQuery.refetch()} />;

  const vehicle = vehicleQuery.data;

  return (
    <div>
      <PageHeader
        title={vehicle.plate}
        description={`${vehicle.brand} ${vehicle.model} · ${VEHICLE_TYPE_LABELS[vehicle.type]}`}
        breadcrumb={[{ label: 'Veículos', href: '/vehicles' }, { label: vehicle.plate }]}
        actions={
          <>
            <Badge tone={VEHICLE_STATUS_TONE[vehicle.status]}>
              {VEHICLE_STATUS_LABELS[vehicle.status]}
            </Badge>
            {hasRole(user?.role, FLEET_WRITE_ROLES) && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Editar
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Odômetro" value={`${formatNumber(vehicle.odometerKm)} km`} />
            <Field
              label="Combustível"
              value={vehicle.fuelType ? VEHICLE_FUEL_TYPE_LABELS[vehicle.fuelType] : '-'}
            />
            <Field
              label="Consumo médio"
              value={
                vehicle.averageConsumptionKmL
                  ? `${formatNumber(vehicle.averageConsumptionKmL, 1)} km/L`
                  : '-'
              }
            />
            <Field
              label="Capacidade do tanque"
              value={
                vehicle.tankCapacityLiters ? `${formatNumber(vehicle.tankCapacityLiters)} L` : '-'
              }
            />
            <Field
              label="Ano fabricação/modelo"
              value={`${vehicle.manufactureYear ?? '-'} / ${vehicle.modelYear ?? '-'}`}
            />
            <Field label="Renavam" value={vehicle.renavam ?? '-'} />
            <Field label="Chassi" value={vehicle.chassisNumber ?? '-'} />
            <Field label="Eixos" value={vehicle.axleCount ? String(vehicle.axleCount) : '-'} />
          </div>
        </CardBody>
      </Card>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'maintenances', label: 'Manutenções' },
          { value: 'fuel', label: 'Abastecimentos' },
          { value: 'tags', label: 'Tags de pedágio' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        {tab === 'overview' && (
          <CardBody>
            <p className="text-sm text-ink-muted">
              {vehicle.notes || 'Nenhuma observação registrada.'}
            </p>
          </CardBody>
        )}
        {tab === 'maintenances' && (
          <DataTable
            columns={maintenanceColumns}
            data={maintenancesQuery.data?.items ?? []}
            isLoading={maintenancesQuery.isLoading}
            isError={maintenancesQuery.isError}
            emptyTitle="Nenhuma manutenção registrada"
          />
        )}
        {tab === 'fuel' && (
          <DataTable
            columns={fuelColumns}
            data={fuelHistoryQuery.data?.items ?? []}
            isLoading={fuelHistoryQuery.isLoading}
            isError={fuelHistoryQuery.isError}
            emptyTitle="Nenhum abastecimento registrado"
          />
        )}
        {tab === 'tags' && (
          <DataTable
            columns={tagColumns}
            data={tagsQuery.data ?? []}
            isLoading={tagsQuery.isLoading}
            isError={tagsQuery.isError}
            emptyTitle="Nenhuma tag vinculada"
          />
        )}
      </div>

      <UpdateVehicleModal open={editOpen} onClose={() => setEditOpen(false)} vehicle={vehicle} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
