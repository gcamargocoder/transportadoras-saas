'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, ClipboardCheck, Droplets, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { DataTable } from '../../../../components/ui/data-table';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { StatCard } from '../../../../components/ui/stat-card';
import { Tabs } from '../../../../components/ui/tabs';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { CheckFuelTankInventoryModal } from '../../../../features/fuel-tanks/check-fuel-tank-inventory-modal';
import { DailyFlowChart, DieselCostChart, StockEvolutionChart } from '../../../../features/fuel-tanks/fuel-tank-charts';
import { FuelTankFlowDiagram } from '../../../../features/fuel-tanks/fuel-tank-flow-diagram';
import { FuelTankHero } from '../../../../features/fuel-tanks/fuel-tank-hero';
import { InternalFuelingTable } from '../../../../features/fuel-tanks/internal-fueling-table';
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
// Fase 5 -- janela usada pela aba "Visão geral" (hero/fluxo/indicadores/
// gráficos): reaproveita GET /fuel-tanks/:id/movements com o maior pageSize
// aceito pelo endpoint (100, mesmo limite das Fases 1-4), nunca um novo
// endpoint de agregação. Metricas ficam claramente rotuladas como "recentes"
// -- nunca apresentadas como historico completo.
const RECENT_WINDOW_SIZE = 100;

const MOVEMENT_TONE: Record<FuelTankMovementEntity['type'], 'success' | 'danger' | 'neutral'> = {
  INITIAL_BALANCE: 'neutral',
  RECEIPT: 'success',
  INTERNAL_FUELING: 'danger',
  ADJUSTMENT: 'neutral',
};

type TabValue = 'overview' | 'fuelings' | 'movements' | 'inventory';

export default function FuelTankDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = hasRole(user?.role, FUEL_SUPPLY_WRITE_ROLES);

  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [fuelingsPage, setFuelingsPage] = useState(1);

  const query = useQuery({ queryKey: ['fuel-tanks', id], queryFn: () => getFuelTank(id) });

  // Visão geral -- 1 unica janela recente, reaproveitada pelo hero, pelo
  // fluxo e pelos 3 graficos (nenhuma requisicao extra por secao visual).
  const recentMovementsQuery = useQuery({
    queryKey: ['fuel-tanks', id, 'movements', 'recent'],
    queryFn: () => getFuelTankMovements(id, { page: 1, pageSize: RECENT_WINDOW_SIZE }),
    enabled: activeTab === 'overview',
  });
  // Conferencia mais recente -- so para o indicador "ultima conferencia" da
  // Visao geral (pageSize=1 no MESMO endpoint da aba Conferencias).
  const latestInventoryCheckQuery = useQuery({
    queryKey: ['fuel-tanks', id, 'inventories', 'latest'],
    queryFn: () => getFuelTankInventoryChecks(id, { page: 1, pageSize: 1 }),
    enabled: activeTab === 'overview',
  });

  const movementsQuery = useQuery({
    queryKey: ['fuel-tanks', id, 'movements', movementsPage],
    queryFn: () => getFuelTankMovements(id, { page: movementsPage, pageSize: PAGE_SIZE }),
    enabled: activeTab === 'movements',
  });
  const inventoryChecksQuery = useQuery({
    queryKey: ['fuel-tanks', id, 'inventories', inventoryPage],
    queryFn: () => getFuelTankInventoryChecks(id, { page: inventoryPage, pageSize: PAGE_SIZE }),
    enabled: activeTab === 'inventory',
  });
  const fuelingsQuery = useQuery({
    queryKey: ['fuel-tanks', id, 'movements', 'internal-fueling', fuelingsPage],
    queryFn: () => getFuelTankMovements(id, { page: fuelingsPage, pageSize: PAGE_SIZE, type: 'INTERNAL_FUELING' }),
    enabled: activeTab === 'fuelings',
  });
  // Mesma queryKey do EntitySelect do modal de recebimento -- compartilha o
  // cache (nenhuma requisicao extra quando o modal ja foi aberto nesta sessao).
  const fuelStationsQuery = useQuery({
    queryKey: ['fuel-stations', 'select'],
    queryFn: () => listFuelStations({ pageSize: 100 }),
    enabled: activeTab === 'movements',
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

  // Indicadores da Visao geral -- derivados so da janela recente ja
  // carregada (nunca uma segunda fonte de saldo/custo). Metrica sem base
  // suficiente mostra estado proprio (null), nunca 0 artificial.
  const overviewMetrics = useMemo(() => {
    const movements = recentMovementsQuery.data?.items ?? [];
    const receipts = movements.filter((m) => m.type === 'RECEIPT');
    const fuelings = movements.filter((m) => m.type === 'INTERNAL_FUELING');
    const receivedLiters = receipts.reduce((sum, m) => sum + m.quantityLiters, 0);
    const fueledLiters = fuelings.reduce((sum, m) => sum + m.quantityLiters, 0);
    const distinctFuelingDays = new Set(fuelings.map((m) => m.effectiveDate.slice(0, 10))).size;
    const avgDailyConsumption = distinctFuelingDays > 0 ? fueledLiters / distinctFuelingDays : null;
    const pricedReceipts = receipts.filter((m) => m.pricePerLiter !== null);
    const avgPricePerLiter =
      pricedReceipts.length > 0 ? pricedReceipts.reduce((sum, m) => sum + (m.pricePerLiter ?? 0), 0) / pricedReceipts.length : null;

    return {
      movements,
      hasMovements: movements.length > 0,
      isWindowFull: movements.length >= RECENT_WINDOW_SIZE,
      receivedLiters: receipts.length > 0 ? receivedLiters : null,
      fueledLiters: fuelings.length > 0 ? fueledLiters : null,
      avgDailyConsumption,
      avgPricePerLiter,
      movementCount: movements.length,
    };
  }, [recentMovementsQuery.data]);

  const latestCheck = latestInventoryCheckQuery.data?.items[0];

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

      {/* Hero -- sempre visivel, independente da aba (secao 2/critério de
          conclusão: "quanto diesel tenho" precisa responder em segundos). */}
      <div className="mb-6">
        <FuelTankHero tank={tank} lastMovement={overviewMetrics.movements[0]} />
      </div>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'fuelings', label: 'Abastecimentos' },
          { value: 'movements', label: 'Movimentações' },
          { value: 'inventory', label: 'Conferências' },
        ]}
        active={activeTab}
        onChange={(v) => setActiveTab(v as TabValue)}
      />

      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            <FuelTankFlowDiagram movements={overviewMetrics.movements} />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Litros recebidos" value={overviewMetrics.receivedLiters !== null ? `${formatNumber(overviewMetrics.receivedLiters)} L` : '—'} tone="success" />
              <StatCard label="Litros abastecidos" value={overviewMetrics.fueledLiters !== null ? `${formatNumber(overviewMetrics.fueledLiters)} L` : '—'} tone="danger" />
              <StatCard
                label="Consumo médio/dia"
                value={overviewMetrics.avgDailyConsumption !== null ? `${formatNumber(overviewMetrics.avgDailyConsumption)} L` : '—'}
              />
              <StatCard
                label="Preço médio recente"
                value={overviewMetrics.avgPricePerLiter !== null ? `${formatCurrency(overviewMetrics.avgPricePerLiter)}/L` : '—'}
              />
              <StatCard label="Movimentações" value={overviewMetrics.hasMovements ? `${overviewMetrics.movementCount}${overviewMetrics.isWindowFull ? '+' : ''}` : '0'} />
              <StatCard
                label="Última conferência"
                value={latestCheck ? formatDateTime(latestCheck.checkedAt) : 'Nenhuma'}
                tone={latestCheck && latestCheck.divergenceLiters !== 0 ? 'warning' : 'brand'}
              />
            </div>
            {latestCheck && latestCheck.divergenceLiters !== 0 && (
              <p className="-mt-3 text-xs text-warning-700">
                Última divergência física: {latestCheck.divergenceLiters > 0 ? '+' : ''}
                {formatNumber(latestCheck.divergenceLiters)} L {latestCheck.adjusted ? '(já ajustada)' : '(ainda não ajustada)'}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Evolução do estoque" description="Saldo após cada movimentação recente." />
                <CardBody>
                  <StockEvolutionChart movements={overviewMetrics.movements} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Entradas × saídas" description="Também representa o consumo diário (saídas)." />
                <CardBody>
                  <DailyFlowChart movements={overviewMetrics.movements} />
                </CardBody>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader title="Custo do diesel" description="Preço por litro pago em cada recebimento recente." />
                <CardBody>
                  <DieselCostChart movements={overviewMetrics.movements} />
                </CardBody>
              </Card>
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
          </div>
        )}

        {activeTab === 'fuelings' && (
          <InternalFuelingTable
            items={fuelingsQuery.data?.items ?? []}
            isLoading={fuelingsQuery.isLoading}
            isError={fuelingsQuery.isError}
            meta={fuelingsQuery.data?.meta}
            onPageChange={setFuelingsPage}
          />
        )}

        {activeTab === 'movements' && (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
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
        )}

        {activeTab === 'inventory' && (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
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
        )}
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
