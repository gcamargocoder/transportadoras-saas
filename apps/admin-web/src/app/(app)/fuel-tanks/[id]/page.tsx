'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, ClipboardCheck, Droplets, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { DataTable } from '../../../../components/ui/data-table';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { RadialGauge } from '../../../../components/ui/radial-gauge';
import { StatCard } from '../../../../components/ui/stat-card';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { CheckFuelTankInventoryModal } from '../../../../features/fuel-tanks/check-fuel-tank-inventory-modal';
import { RegisterFuelTankReceiptModal } from '../../../../features/fuel-tanks/register-fuel-tank-receipt-modal';
import { UpdateFuelTankModal } from '../../../../features/fuel-tanks/update-fuel-tank-modal';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { listFuelStations } from '../../../../lib/api/fuel.api';
import {
  getFuelTank,
  getFuelTankInventoryChecks,
  getFuelTankMovements,
  updateFuelTankStatus,
} from '../../../../lib/api/fuel-tanks.api';
import { FUEL_SUPPLY_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { FUEL_TANK_MOVEMENT_TYPE_LABELS, FUEL_TYPE_LABELS } from '../../../../lib/labels';
import type { FuelTankInventoryCheckEntity, FuelTankMovementEntity } from '../../../../types/entities';
import { formatCurrency, formatDateTime, formatNumber } from '../../../../utils/format';

const PAGE_SIZE = 20;

const MOVEMENT_TONE: Record<FuelTankMovementEntity['type'], 'success' | 'danger' | 'neutral'> = {
  INITIAL_BALANCE: 'neutral',
  RECEIPT: 'success',
  INTERNAL_FUELING: 'danger',
  ADJUSTMENT: 'neutral',
};

export default function FuelTankDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = hasRole(user?.role, FUEL_SUPPLY_WRITE_ROLES);

  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);
  const [inventoryPage, setInventoryPage] = useState(1);

  const query = useQuery({ queryKey: ['fuel-tanks', id], queryFn: () => getFuelTank(id) });
  const movementsQuery = useQuery({
    queryKey: ['fuel-tanks', id, 'movements', movementsPage],
    queryFn: () => getFuelTankMovements(id, { page: movementsPage, pageSize: PAGE_SIZE }),
  });
  const inventoryChecksQuery = useQuery({
    queryKey: ['fuel-tanks', id, 'inventories', inventoryPage],
    queryFn: () => getFuelTankInventoryChecks(id, { page: inventoryPage, pageSize: PAGE_SIZE }),
  });
  // Mesma queryKey do EntitySelect do modal de recebimento -- compartilha o
  // cache (nenhuma requisicao extra quando o modal ja foi aberto nesta sessao).
  const fuelStationsQuery = useQuery({
    queryKey: ['fuel-stations', 'select'],
    queryFn: () => listFuelStations({ pageSize: 100 }),
  });
  const fuelStationNameById = new Map((fuelStationsQuery.data?.items ?? []).map((s) => [s.id, s.name]));

  const statusMutation = useMutation({
    mutationFn: (active: boolean) => updateFuelTankStatus(id, active),
    onSuccess: () => {
      toast.success('Status do tanque atualizado.');
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const movementColumns: ColumnDef<FuelTankMovementEntity, unknown>[] = [
    { header: 'Data', cell: ({ row }) => formatDateTime(row.original.effectiveDate) },
    {
      header: 'Tipo',
      cell: ({ row }) => <Badge tone={MOVEMENT_TONE[row.original.type]}>{FUEL_TANK_MOVEMENT_TYPE_LABELS[row.original.type]}</Badge>,
    },
    {
      header: 'Quantidade',
      cell: ({ row }) =>
        `${row.original.type === 'INTERNAL_FUELING' ? '-' : row.original.quantityLiters > 0 ? '+' : ''}${formatNumber(row.original.quantityLiters)} L`,
    },
    { header: 'Saldo anterior', cell: ({ row }) => `${formatNumber(row.original.previousBalanceLiters)} L` },
    { header: 'Saldo posterior', cell: ({ row }) => `${formatNumber(row.original.newBalanceLiters)} L` },
    {
      header: 'Custo',
      cell: ({ row }) =>
        row.original.pricePerLiter !== null && row.original.totalAmount !== null ? (
          <div>
            <p className="text-ink">{formatCurrency(row.original.totalAmount)}</p>
            <p className="text-xs text-ink-subtle">{formatCurrency(row.original.pricePerLiter)}/L</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      // RECEIPT: fornecedor + nota fiscal. INTERNAL_FUELING (Fase 3): veículo
      // + motorista + viagem -- "qual veículo retirou, quem realizou, de qual
      // tanque" (secao 12 do pedido), sem virar um segundo módulo de compras.
      header: 'Origem / destino',
      cell: ({ row }) => {
        const stationName = row.original.fuelStationId ? fuelStationNameById.get(row.original.fuelStationId) : null;
        const parts = [
          stationName,
          row.original.invoiceNumber ? `NF ${row.original.invoiceNumber}` : null,
          row.original.vehiclePlate,
          row.original.driverName,
          row.original.tripLabel,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : '—';
      },
    },
    { header: 'Observação', accessorFn: (row) => row.notes ?? '—' },
  ];

  const inventoryCheckColumns: ColumnDef<FuelTankInventoryCheckEntity, unknown>[] = [
    { header: 'Data', cell: ({ row }) => formatDateTime(row.original.checkedAt) },
    { header: 'Teórico', cell: ({ row }) => `${formatNumber(row.original.theoreticalStockLiters)} L` },
    { header: 'Medido', cell: ({ row }) => `${formatNumber(row.original.measuredStockLiters)} L` },
    {
      header: 'Divergência',
      cell: ({ row }) => {
        const d = row.original;
        if (d.divergenceLiters === 0) return <span className="text-success-600">Sem divergência</span>;
        return (
          <span className={d.adjusted ? 'text-ink' : 'text-warning-600'}>
            {d.divergenceLiters > 0 ? '+' : ''}
            {formatNumber(d.divergenceLiters)} L
            {d.divergencePercent !== null && ` (${d.divergenceLiters > 0 ? '+' : ''}${formatNumber(d.divergencePercent, 1)}%)`}
          </span>
        );
      },
    },
    {
      header: 'Ajustado',
      cell: ({ row }) => (row.original.adjusted ? <Badge tone="success">Sim</Badge> : <Badge tone="neutral">Não</Badge>),
    },
    { header: 'Motivo', accessorFn: (row) => row.notes ?? '—' },
  ];

  if (query.isLoading) return <LoadingState label="Carregando tanque" />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const tank = query.data;

  return (
    <div>
      <PageHeader
        title={tank.name}
        description={FUEL_TYPE_LABELS[tank.fuelType]}
        breadcrumb={[{ label: 'Tanques', href: '/fuel-tanks' }, { label: tank.name }]}
        actions={
          <>
            {tank.isLowStock ? <Badge tone="warning">Estoque baixo</Badge> : <Badge tone="success">Normal</Badge>}
            <Badge tone={tank.status === 'ACTIVE' ? 'success' : 'neutral'}>{tank.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Badge>
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Editar
              </Button>
            )}
          </>
        }
      />

      {canWrite && (
        <div className="mb-4 flex flex-wrap gap-2">
          {tank.status === 'ACTIVE' && (
            <Button size="sm" onClick={() => setReceiveOpen(true)}>
              <Droplets size={14} />
              Receber diesel
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setCheckOpen(true)}>
            <ClipboardCheck size={14} />
            Conferir estoque
          </Button>
          <Button
            size="sm"
            variant={tank.status === 'ACTIVE' ? 'danger' : 'outline'}
            onClick={() => statusMutation.mutate(tank.status !== 'ACTIVE')}
            loading={statusMutation.isPending}
          >
            {tank.status === 'ACTIVE' ? <Ban size={14} /> : <CheckCircle2 size={14} />}
            {tank.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
        <Card>
          <CardBody className="flex items-center justify-center">
            <RadialGauge
              percentage={tank.occupancyPercent}
              size={120}
              centerValue={`${Math.round(tank.occupancyPercent)}%`}
              label="Ocupação"
            />
          </CardBody>
        </Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Estoque atual" value={`${formatNumber(tank.currentStockLiters)} L`} />
          <StatCard label="Capacidade" value={`${formatNumber(tank.capacityLiters)} L`} />
          <StatCard label="Estoque mínimo" value={tank.minStockLiters !== null ? `${formatNumber(tank.minStockLiters)} L` : '—'} />
          <StatCard label="Estoque inicial" value={`${formatNumber(tank.initialStockLiters)} L`} />
        </div>
      </div>

      <Card>
        <CardHeader title="Identificação" />
        <CardBody>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Localização" value={tank.location ?? '—'} />
            <Field label="Combustível" value={FUEL_TYPE_LABELS[tank.fuelType]} />
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-white">
        <CardHeader title="Movimentações" description="Histórico completo (append-only), mais recente primeiro." />
        <DataTable
          columns={movementColumns}
          data={movementsQuery.data?.items ?? []}
          isLoading={movementsQuery.isLoading}
          isError={movementsQuery.isError}
          getRowId={(m) => m.id}
          emptyTitle="Nenhuma movimentação registrada"
        />
        {movementsQuery.data && <Pagination meta={movementsQuery.data.meta} onPageChange={setMovementsPage} />}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-white">
        <CardHeader
          title="Conferências de estoque"
          description="Histórico de medições físicas -- inclui conferências sem divergência e divergências ainda não ajustadas."
        />
        <DataTable
          columns={inventoryCheckColumns}
          data={inventoryChecksQuery.data?.items ?? []}
          isLoading={inventoryChecksQuery.isLoading}
          isError={inventoryChecksQuery.isError}
          getRowId={(c) => c.id}
          emptyTitle="Nenhuma conferência registrada"
        />
        {inventoryChecksQuery.data && <Pagination meta={inventoryChecksQuery.data.meta} onPageChange={setInventoryPage} />}
      </div>

      <UpdateFuelTankModal open={editOpen} onClose={() => setEditOpen(false)} tank={tank} />
      <RegisterFuelTankReceiptModal open={receiveOpen} onClose={() => setReceiveOpen(false)} tank={tank} />
      <CheckFuelTankInventoryModal open={checkOpen} onClose={() => setCheckOpen(false)} tank={tank} />
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
