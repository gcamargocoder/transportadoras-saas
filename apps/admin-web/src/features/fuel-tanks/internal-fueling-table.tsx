'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../components/ui/data-table';
import { Pagination } from '../../components/ui/pagination';
import type { PaginationMeta } from '../../types/api';
import type { FuelTankMovementEntity } from '../../types/entities';
import { formatDateTime, formatNumber } from '../../utils/format';

// Fase 5, secao 6 -- visao investigativa dos abastecimentos internos, mesmo
// padrao das tabelas investigativas ja usadas em Frota/Custos/Prazos/
// Ocorrencias (BI 2/8): reaproveita GET /fuel-tanks/:id/movements?type=
// INTERNAL_FUELING (filtro ja existente desde a Fase 1), nenhum endpoint
// novo. Custo nunca e exibido aqui -- abastecimento interno nao registra
// preco/total (litros saem do proprio estoque, sem uma compra associada a
// ELE); mostrar "-" em vez de inventar um valor.
const columns: ColumnDef<FuelTankMovementEntity, unknown>[] = [
  { header: 'Data/hora', cell: ({ row }) => formatDateTime(row.original.effectiveDate) },
  { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? 'Não identificado' },
  { header: 'Motorista', accessorFn: (row) => row.driverName ?? '—' },
  { header: 'Viagem', accessorFn: (row) => row.tripLabel ?? '—' },
  { header: 'Litros', cell: ({ row }) => `${formatNumber(row.original.quantityLiters)} L` },
  { header: 'Saldo após', cell: ({ row }) => `${formatNumber(row.original.newBalanceLiters)} L` },
];

export function InternalFuelingTable({
  items,
  isLoading,
  isError,
  meta,
  onPageChange,
}: {
  items: FuelTankMovementEntity[];
  isLoading: boolean;
  isError: boolean;
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
}): JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        getRowId={(m) => m.id}
        emptyTitle="Nenhum abastecimento interno registrado"
        emptyDescription="Quando um motorista abastecer pelo Driver App a partir deste tanque, o registro aparece aqui."
      />
      {meta && <Pagination meta={meta} onPageChange={onPageChange} />}
    </div>
  );
}
