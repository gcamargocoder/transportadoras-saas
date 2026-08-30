'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import { EntitySelect } from '../../components/ui/entity-select';
import { FilterBar } from '../../components/ui/filter-bar';
import { FormField } from '../../components/ui/form-field';
import { Pagination } from '../../components/ui/pagination';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import { toFriendlyMessage } from '../../lib/api/errors';
import { invoiceTripBilling, listEligibleTripsForBilling } from '../../lib/api/billing-operational.api';
import { listDrivers } from '../../lib/api/drivers.api';
import { listFleets, listVehicles } from '../../lib/api/fleet.api';
import { listCustomers } from '../../lib/api/trips.api';
import { BILLING_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { TRIP_STATUS_LABELS, labelOrValue } from '../../lib/labels';
import { TRIP_STATUS_TONE } from '../trips/status';
import type { EligibleTripForBillingEntity } from '../../types/entities';
import type { TripStatus } from '../../types/enums';
import { formatCurrency, formatDate } from '../../utils/format';

const PAGE_SIZE = 20;

// Fase 103 -- "selecionar viagens elegiveis para faturamento": viagens com
// valor comercial calculado (TripFreight) e saldo ainda a faturar, que
// NUNCA aparecem na listagem de TripBilling (Fase 60) porque nenhum
// faturamento foi iniciado ainda para elas. Reaproveita integralmente
// POST /operational-billing/trips/:tripId/invoice (mesma acao "Faturar" ja
// usada na aba de faturamento da viagem) -- nenhuma logica de faturamento
// nova aqui, so a descoberta das viagens candidatas.
export function EligibleTripsPanel(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canWrite = hasRole(user?.role, BILLING_WRITE_ROLES);

  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [fleetId, setFleetId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  // Fase 103 -- "conectando viagens concluidas ao faturamento": a UI
  // comeca filtrada em COMPLETED, mas o usuario pode limpar para ver
  // viagens elegiveis em qualquer status (o backend nunca exige COMPLETED,
  // ver auditoria em docs/billing.md).
  const [tripStatus, setTripStatus] = useState<TripStatus | ''>('COMPLETED');

  const filters = {
    customerId: customerId || undefined,
    fleetId: fleetId || undefined,
    vehicleId: vehicleId || undefined,
    driverId: driverId || undefined,
    tripStatus: tripStatus || undefined,
  };
  const hasActiveFilters = Boolean(customerId || fleetId || vehicleId || driverId || tripStatus !== 'COMPLETED');

  function clearFilters(): void {
    setCustomerId('');
    setFleetId('');
    setVehicleId('');
    setDriverId('');
    setTripStatus('');
    setPage(1);
  }

  const query = useQuery({
    queryKey: ['billing', 'eligible-trips', { page, ...filters }],
    queryFn: ({ signal }) => listEligibleTripsForBilling({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const invoiceMutation = useMutation({
    mutationFn: (tripId: string) => invoiceTripBilling(tripId, {}),
    onSuccess: () => {
      toast.success('Viagem faturada.');
      queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (error) => toast.error('Não foi possível faturar a viagem.', toFriendlyMessage(error)),
  });

  const columns: ColumnDef<EligibleTripForBillingEntity, unknown>[] = [
    {
      header: 'Viagem',
      cell: ({ row }) => (
        <div>
          <div>{row.original.tripLabel}</div>
          <Badge tone={TRIP_STATUS_TONE[row.original.tripStatus]}>{TRIP_STATUS_LABELS[row.original.tripStatus]}</Badge>
        </div>
      ),
    },
    { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
    { header: 'Motorista', accessorFn: (row) => row.driverName ?? '—' },
    { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? '—' },
    { header: 'Faturável', cell: ({ row }) => formatCurrency(row.original.billableAmount) },
    { header: 'Já faturado', cell: ({ row }) => formatCurrency(row.original.invoicedAmount) },
    { header: 'Saldo', cell: ({ row }) => (row.original.balance !== null ? formatCurrency(row.original.balance) : '—') },
    { header: 'Chegada', cell: ({ row }) => (row.original.actualArrival ? formatDate(row.original.actualArrival) : '—') },
    ...(canWrite
      ? [
          {
            id: 'actions',
            header: '',
            cell: ({ row }: { row: { original: EligibleTripForBillingEntity } }) => (
              <Button
                size="sm"
                onClick={() => invoiceMutation.mutate(row.original.tripId)}
                loading={invoiceMutation.isPending && invoiceMutation.variables === row.original.tripId}
              >
                <Receipt size={14} />
                Faturar
              </Button>
            ),
          } satisfies ColumnDef<EligibleTripForBillingEntity, unknown>,
        ]
      : []),
  ];

  return (
    <div>
      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
        <FormField label="Status da viagem" htmlFor="eligible-trips-status" className="w-full sm:w-44">
          <Select
            id="eligible-trips-status"
            value={tripStatus}
            onChange={(e) => {
              setTripStatus(e.target.value as TripStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(TRIP_STATUS_LABELS) as TripStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(TRIP_STATUS_LABELS, s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Cliente" htmlFor="eligible-trips-customer" className="w-full sm:w-48">
          <EntitySelect
            id="eligible-trips-customer"
            queryKey={['customers', 'select']}
            queryFn={() => listCustomers({ pageSize: 100 })}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => c.name}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Frota" htmlFor="eligible-trips-fleet" className="w-full sm:w-44">
          <EntitySelect
            id="eligible-trips-fleet"
            queryKey={['fleets', 'select']}
            queryFn={() => listFleets({ pageSize: 100 })}
            getOptionValue={(f) => f.id}
            getOptionLabel={(f) => f.name}
            value={fleetId}
            onChange={(v) => {
              setFleetId(v);
              setPage(1);
            }}
            placeholder="Todas"
          />
        </FormField>
        <FormField label="Veículo" htmlFor="eligible-trips-vehicle" className="w-full sm:w-44">
          <EntitySelect
            id="eligible-trips-vehicle"
            queryKey={['vehicles', 'select']}
            queryFn={() => listVehicles({ pageSize: 100 })}
            getOptionValue={(v) => v.id}
            getOptionLabel={(v) => v.plate}
            value={vehicleId}
            onChange={(v) => {
              setVehicleId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Motorista" htmlFor="eligible-trips-driver" className="w-full sm:w-44">
          <EntitySelect
            id="eligible-trips-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100 })}
            getOptionValue={(d) => d.id}
            getOptionLabel={(d) => d.name}
            value={driverId}
            onChange={(v) => {
              setDriverId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          getRowId={(t) => t.tripId}
          emptyTitle="Nenhuma viagem elegível para faturamento"
          emptyDescription="Não há viagens com valor comercial calculado e saldo pendente para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
