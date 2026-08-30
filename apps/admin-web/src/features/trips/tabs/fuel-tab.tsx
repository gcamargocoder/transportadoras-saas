'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { useAuth } from '../../../hooks/use-auth';
import { CreateFuelSupplyModal } from '../../fuel/create-fuel-supply-modal';
import { listFuelSupplies } from '../../../lib/api/fuel.api';
import { FUEL_SUPPLY_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { FUEL_TYPE_LABELS } from '../../../lib/labels';
import type { FuelSupplyEntity } from '../../../types/entities';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/format';

// Fase 107 -- fecha a lacuna real de "contexto da viagem": antes desta fase,
// so era possivel ver os abastecimentos de UMA viagem indo ate a tela global
// /fuel-supplies e filtrando manualmente por tripId (o backend ja suportava
// o filtro, o admin-web nao o expunha em lugar nenhum). Reaproveita
// INTEGRALMENTE GET /fuel-supplies?tripId=... (mesmo endpoint/servico da
// tela global, nenhuma consulta nova) -- so uma apresentacao adicional.
export function FuelTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const canWrite = hasRole(user?.role, FUEL_SUPPLY_WRITE_ROLES);

  const query = useQuery({
    queryKey: ['fuel-supplies', 'list', { tripId }],
    queryFn: () => listFuelSupplies({ tripId, pageSize: 50 }),
  });

  const totalAmount = useMemo(
    () => (query.data?.items ?? []).reduce((sum, s) => sum + s.totalAmount, 0),
    [query.data],
  );
  const totalLiters = useMemo(
    () => (query.data?.items ?? []).reduce((sum, s) => sum + s.liters, 0),
    [query.data],
  );

  const columns = useMemo<ColumnDef<FuelSupplyEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.supplyDate) },
      { header: 'Posto', accessorFn: (row) => row.fuelStationName ?? '-' },
      { header: 'Combustível', accessorFn: (row) => FUEL_TYPE_LABELS[row.fuelType] },
      { header: 'Litros', cell: ({ row }) => `${formatNumber(row.original.liters, 1)} L` },
      { header: 'Odômetro', cell: ({ row }) => `${formatNumber(row.original.odometerKm, 0)} km` },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.totalAmount) },
    ],
    [],
  );

  return (
    <div>
      {(query.data?.items.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-6 border-b border-border p-3 text-sm">
          <span className="text-ink-subtle">
            Total: <strong className="text-ink">{formatCurrency(totalAmount)}</strong>
          </span>
          <span className="text-ink-subtle">
            Litros: <strong className="text-ink">{formatNumber(totalLiters, 1)} L</strong>
          </span>
        </div>
      )}
      {canWrite && (
        <div className="flex justify-end p-3">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Registrar abastecimento
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(s) => s.id}
        emptyTitle="Nenhum abastecimento registrado nesta viagem"
      />
      <CreateFuelSupplyModal open={createOpen} onClose={() => setCreateOpen(false)} defaultTripId={tripId} />
    </div>
  );
}
