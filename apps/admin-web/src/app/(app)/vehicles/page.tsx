'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Plus, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { LimitIndicator } from '../../../components/ui/limit-indicator';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { Select } from '../../../components/ui/select';
import { StatCard } from '../../../components/ui/stat-card';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { useTenantPlan } from '../../../hooks/use-tenant-plan';
import { getVehicleSummary, listVehicles } from '../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { CreateVehicleModal } from '../../../features/fleet/create-vehicle-modal';
import { VEHICLE_STATUS_TONE } from '../../../features/fleet/status';
import {
  FLEET_AVAILABILITY_STATUS_LABELS,
  FLEET_AVAILABILITY_STATUS_TONE,
  VEHICLE_AVAILABILITY_LABELS,
  VEHICLE_OWNERSHIP_TYPE_LABELS,
  VEHICLE_OWNERSHIP_TYPE_TONE,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
} from '../../../lib/labels';
import type { VehicleAvailabilityBreakdownEntity, VehicleEntity } from '../../../types/entities';
import type { VehicleAvailability, VehicleOwnershipType, VehicleStatus, VehicleType } from '../../../types/enums';
import { formatNumber, formatPercent } from '../../../utils/format';

const PAGE_SIZE = 20;

// Fase 86 -- "count (percent%)" a partir de VehicleSummaryEntity.availabilityBreakdown
// (nunca divide por zero -- percent ja vem calculado com essa guarda pelo backend).
function breakdownLabel(breakdown: VehicleAvailabilityBreakdownEntity[] | undefined, status: string): string {
  const entry = breakdown?.find((e) => e.status === status);
  if (!entry) return '—';
  return `${entry.count} (${formatPercent(entry.percent)})`;
}

export default function VehiclesPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const { plan } = useTenantPlan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VehicleStatus | ''>('');
  const [type, setType] = useState<VehicleType | ''>('');
  const [ownershipType, setOwnershipType] = useState<VehicleOwnershipType | ''>('');
  const [availability, setAvailability] = useState<VehicleAvailability | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);
  const hasActiveFilters = Boolean(search || status || type || ownershipType || availability);

  const summaryQuery = useQuery({
    queryKey: ['vehicles', 'summary'],
    queryFn: ({ signal }) => getVehicleSummary(signal),
  });

  const query = useQuery({
    queryKey: ['vehicles', { page, search: debouncedSearch, status, type, ownershipType, availability }],
    queryFn: ({ signal }) =>
      listVehicles(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status || undefined,
          type: type || undefined,
          ownershipType: ownershipType || undefined,
          availability: availability || undefined,
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<VehicleEntity, unknown>[]>(
    () => [
      {
        header: 'Placa',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.plate}</p>
            <p className="text-xs text-ink-subtle">
              {row.original.brand} {row.original.model}
            </p>
          </div>
        ),
      },
      { header: 'Tipo', accessorFn: (row) => VEHICLE_TYPE_LABELS[row.type] },
      {
        header: 'Propriedade',
        cell: ({ row }) => (
          <Badge tone={VEHICLE_OWNERSHIP_TYPE_TONE[row.original.ownershipType]}>
            {VEHICLE_OWNERSHIP_TYPE_LABELS[row.original.ownershipType]}
          </Badge>
        ),
      },
      { header: 'Motorista atual', accessorFn: (row) => row.currentDriverName ?? '—' },
      { header: 'Odômetro', cell: ({ row }) => `${formatNumber(row.original.odometerKm)} km` },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={VEHICLE_STATUS_TONE[row.original.status]}>
            {VEHICLE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        header: 'Disponibilidade',
        cell: ({ row }) => (
          <div>
            <Badge tone={FLEET_AVAILABILITY_STATUS_TONE[row.original.fleetAvailabilityStatus]}>
              {FLEET_AVAILABILITY_STATUS_LABELS[row.original.fleetAvailabilityStatus]}
            </Badge>
            {row.original.unavailabilityReason && (
              <p className="mt-1 text-xs text-ink-subtle">{row.original.unavailabilityReason}</p>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Veículos"
        description="Frota de veículos cadastrados na transportadora."
        actions={
          <>
            {query.data && (
              <LimitIndicator label="Veículos" current={query.data.meta.total} max={plan?.maxVehicles} />
            )}
            {hasRole(user?.role, FLEET_WRITE_ROLES) && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Novo veículo
              </Button>
            )}
          </>
        }
      />

      {summaryQuery.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Disponíveis"
            value={breakdownLabel(summaryQuery.data.availabilityBreakdown, 'AVAILABLE')}
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard
            label="Em viagem"
            value={breakdownLabel(summaryQuery.data.availabilityBreakdown, 'ON_TRIP')}
            icon={Truck}
            tone="info"
          />
          <StatCard label="Em manutenção" value={breakdownLabel(summaryQuery.data.availabilityBreakdown, 'MAINTENANCE')} />
          <StatCard
            label="Indisponíveis"
            value={breakdownLabel(summaryQuery.data.availabilityBreakdown, 'UNAVAILABLE')}
            icon={AlertTriangle}
            tone={summaryQuery.data.totalSuspended > 0 ? 'warning' : 'success'}
          />
          <StatCard label="Inativos" value={breakdownLabel(summaryQuery.data.availabilityBreakdown, 'INACTIVE')} />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setStatus('');
          setType('');
          setOwnershipType('');
          setAvailability('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="vehicle-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Placa, marca, modelo..."
          />
        </FormField>
        <FormField label="Status" htmlFor="vehicle-status" className="w-full sm:w-44">
          <Select
            id="vehicle-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as VehicleStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(VEHICLE_STATUS_LABELS) as VehicleStatus[]).map((s) => (
              <option key={s} value={s}>
                {VEHICLE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tipo" htmlFor="vehicle-type" className="w-full sm:w-44">
          <Select
            id="vehicle-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as VehicleType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
              <option key={t} value={t}>
                {VEHICLE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Propriedade" htmlFor="vehicle-ownership" className="w-full sm:w-40">
          <Select
            id="vehicle-ownership"
            value={ownershipType}
            onChange={(e) => {
              setOwnershipType(e.target.value as VehicleOwnershipType | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(VEHICLE_OWNERSHIP_TYPE_LABELS) as VehicleOwnershipType[]).map((t) => (
              <option key={t} value={t}>
                {VEHICLE_OWNERSHIP_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Disponibilidade" htmlFor="vehicle-availability" className="w-full sm:w-44">
          <Select
            id="vehicle-availability"
            value={availability}
            onChange={(e) => {
              setAvailability(e.target.value as VehicleAvailability | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(VEHICLE_AVAILABILITY_LABELS) as VehicleAvailability[]).map((a) => (
              <option key={a} value={a}>
                {VEHICLE_AVAILABILITY_LABELS[a]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(vehicle) => router.push(`/vehicles/${vehicle.id}`)}
          getRowId={(vehicle) => vehicle.id}
          emptyTitle="Nenhum veículo encontrado"
          emptyDescription="Não existem veículos para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateVehicleModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
