'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Clock, Gauge, Info, ShieldAlert, Timer, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { Modal } from '../../../../../components/ui/modal';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { RadialGauge } from '../../../../../components/ui/radial-gauge';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { FleetFilters } from '../../../../../features/fleet-operations/fleet-filters';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { MaintenancePlansSection } from '../../../../../features/fleet-operations/maintenance-plans-section';
import { MAINTENANCE_STATUS_TONE } from '../../../../../features/fleet/status';
import { listMaintenances } from '../../../../../lib/api/fleet.api';
import { getFleetOperationsMaintenance } from '../../../../../lib/api/fleet-operations.api';
import {
  MAINTENANCE_COMPONENT_LABELS,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
} from '../../../../../lib/labels';
import type {
  FleetMaintenanceComponentBreakdownEntity,
  FleetMaintenancePlanStatusEntity,
  FleetMaintenancePriorityBreakdownEntity,
  FleetMaintenanceTypeBreakdownEntity,
  FleetMaintenanceWorkshopBreakdownEntity,
  MaintenanceEntity,
} from '../../../../../types/entities';
import type { MaintenanceComponent, VehicleMaintenancePriority, VehicleMaintenanceStatus, VehicleMaintenanceType } from '../../../../../types/enums';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../../../../utils/format';

const PAGE_SIZE = 20;

const TYPE_OPTIONS = Object.entries(MAINTENANCE_TYPE_LABELS) as [VehicleMaintenanceType, string][];
const STATUS_OPTIONS = Object.entries(MAINTENANCE_STATUS_LABELS) as [VehicleMaintenanceStatus, string][];
const PRIORITY_OPTIONS = Object.entries(MAINTENANCE_PRIORITY_LABELS) as [VehicleMaintenancePriority, string][];
const COMPONENT_OPTIONS = Object.entries(MAINTENANCE_COMPONENT_LABELS) as [MaintenanceComponent, string][];

function componentLabel(component: MaintenanceComponent | null): string {
  return component ? MAINTENANCE_COMPONENT_LABELS[component] : 'Não informado';
}

export default function FleetMaintenancePage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const dashboardQuery = useQuery({
    queryKey: ['fleet-operations', 'maintenance', filters],
    queryFn: ({ signal }) => getFleetOperationsMaintenance(filters, signal),
  });

  // Tabela de registros (secao 10) -- filtros proprios, mais amplos que os
  // do dashboard (placa/tipo/status/prioridade/componente/fornecedor), ver
  // FindMaintenancesQueryDto no backend.
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [component, setComponent] = useState('');
  const [supplier, setSupplier] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceEntity | null>(null);

  const listFilters = {
    vehicleId: vehicleId || undefined,
    openedFrom: startDate || undefined,
    openedTo: endDate || undefined,
    type: (type || undefined) as VehicleMaintenanceType | undefined,
    status: (status || undefined) as VehicleMaintenanceStatus | undefined,
    priority: (priority || undefined) as VehicleMaintenancePriority | undefined,
    component: (component || undefined) as MaintenanceComponent | undefined,
    supplier: supplier || undefined,
  };
  const hasListFilters = Boolean(type || status || priority || component || supplier);

  const listQuery = useQuery({
    queryKey: ['maintenances', 'list', page, listFilters],
    queryFn: ({ signal }) => listMaintenances({ page, pageSize: PAGE_SIZE, ...listFilters }, signal),
  });

  const typeColumns = useMemo<ColumnDef<FleetMaintenanceTypeBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Tipo', accessorFn: (row) => MAINTENANCE_TYPE_LABELS[row.type] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
    ],
    [],
  );

  const priorityColumns = useMemo<ColumnDef<FleetMaintenancePriorityBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Prioridade', accessorFn: (row) => MAINTENANCE_PRIORITY_LABELS[row.priority] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
    ],
    [],
  );

  const workshopColumns = useMemo<ColumnDef<FleetMaintenanceWorkshopBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Oficina', accessorFn: (row) => row.workshop ?? 'Não informada' },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
    ],
    [],
  );

  const componentColumns = useMemo<ColumnDef<FleetMaintenanceComponentBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Componente', accessorFn: (row) => componentLabel(row.component) },
      { header: 'Ocorrências', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
    ],
    [],
  );

  const planStatusColumns = useMemo<ColumnDef<FleetMaintenancePlanStatusEntity, unknown>[]>(
    () => [
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate },
      { header: 'Plano', accessorFn: (row) => row.name },
      { header: 'Componente', accessorFn: (row) => MAINTENANCE_COMPONENT_LABELS[row.component] },
      {
        header: 'Vencimento',
        accessorFn: (row) =>
          [row.dueOdometerKm !== null ? `${formatNumber(row.dueOdometerKm)} km` : null, row.dueDate ? formatDate(row.dueDate) : null]
            .filter(Boolean)
            .join(' · ') || '—',
      },
      {
        header: 'Excesso',
        accessorFn: (row) =>
          [row.overdueByKm !== null ? `${formatNumber(row.overdueByKm)} km` : null, row.overdueByDays !== null ? `${row.overdueByDays} dia(s)` : null]
            .filter(Boolean)
            .join(' · ') || '—',
      },
    ],
    [],
  );

  const recordColumns = useMemo<ColumnDef<MaintenanceEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.openedAt) },
      { header: 'Tipo', accessorFn: (row) => MAINTENANCE_TYPE_LABELS[row.type] },
      { header: 'Componente', accessorFn: (row) => componentLabel(row.component) },
      { header: 'Oficina', accessorFn: (row) => row.workshop ?? '—' },
      { header: 'Fornecedor', accessorFn: (row) => row.supplier ?? '—' },
      { header: 'Custo total', cell: ({ row }) => (row.original.totalCost === null ? '—' : formatCurrency(row.original.totalCost)) },
      {
        header: 'Prioridade',
        cell: ({ row }) => <Badge tone={row.original.priority === 'CRITICAL' ? 'danger' : 'neutral'}>{MAINTENANCE_PRIORITY_LABELS[row.original.priority]}</Badge>,
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={MAINTENANCE_STATUS_TONE[row.original.status]}>{MAINTENANCE_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Gestão de Manutenção da Frota"
        description="Manutenções preventivas e corretivas, custos, peças, planos preventivos e alertas."
      />

      <FleetFilters
        idPrefix="fmaint"
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        vehicleId={vehicleId}
        onVehicleIdChange={setVehicleId}
        fleetId={fleetId}
        onFleetIdChange={setFleetId}
        hasActiveFilters={hasActiveFilters}
        onClear={clear}
      />

      {dashboardQuery.isLoading && <SkeletonCards count={4} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

      {dashboardQuery.data && (
        <div className="flex flex-col gap-6">
          {/* ===== 1. Cards de indicadores principais (agrupados por hierarquia) ===== */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Volume</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total de manutenções" value={formatNumber(dashboardQuery.data.totalCount)} icon={Wrench} />
              <StatCard label="Preventivas" value={formatNumber(dashboardQuery.data.preventiveCount)} tone="success" />
              <StatCard label="Corretivas" value={formatNumber(dashboardQuery.data.correctiveCount)} tone="warning" />
              <StatCard label="Programadas" value={formatNumber(dashboardQuery.data.scheduledCount)} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Custos</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Custo total" value={formatCurrency(dashboardQuery.data.totalCost)} variant="gradient" />
              <StatCard label="Custo de peças" value={formatCurrency(dashboardQuery.data.partsCostTotal)} />
              <StatCard label="Custo de mão de obra" value={formatCurrency(dashboardQuery.data.laborCostTotal)} />
              <StatCard
                label="Custo médio/ocorrência"
                value={dashboardQuery.data.averageCostPerOccurrence === null ? '—' : formatCurrency(dashboardQuery.data.averageCostPerOccurrence)}
              />
              <StatCard
                label="Custo por km"
                value={dashboardQuery.data.costPerKm.available && dashboardQuery.data.costPerKm.value !== null ? formatCurrency(dashboardQuery.data.costPerKm.value) : 'Indisponível'}
                icon={Gauge}
              />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Tempo parado</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Tempo parado total"
                value={dashboardQuery.data.totalDowntimeMinutes === null ? '—' : `${formatNumber(dashboardQuery.data.totalDowntimeMinutes)} min`}
                icon={Timer}
              />
              <StatCard
                label="Tempo parado médio"
                value={dashboardQuery.data.averageDowntimeMinutes === null ? '—' : `${formatNumber(dashboardQuery.data.averageDowntimeMinutes, 1)} min`}
                icon={Clock}
              />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Vencimento e alertas</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Manutenções vencidas"
                value={formatNumber(dashboardQuery.data.overdueCount)}
                icon={AlertTriangle}
                tone={dashboardQuery.data.overdueCount > 0 ? 'danger' : 'success'}
              />
              <StatCard
                label="Próximas manutenções"
                value={formatNumber(dashboardQuery.data.dueSoonCount)}
                tone={dashboardQuery.data.dueSoonCount > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="OS atrasadas"
                value={formatNumber(dashboardQuery.data.lateWorkOrdersCount)}
                icon={AlertTriangle}
                tone={dashboardQuery.data.lateWorkOrdersCount > 0 ? 'danger' : 'success'}
              />
              <StatCard
                label="Alertas críticos"
                value={formatNumber(dashboardQuery.data.maintenanceAlerts.filter((a) => a.severity === 'CRITICAL').length)}
                tone={dashboardQuery.data.maintenanceAlerts.some((a) => a.severity === 'CRITICAL') ? 'danger' : 'success'}
              />
            </div>
          </div>

          {/* ===== 5. Distribuicao preventiva/corretiva + prioridade/oficina ===== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Por tipo (distribuição preventiva/corretiva)" />
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                {dashboardQuery.data.totalCount > 0 && (
                  <div className="flex shrink-0 flex-col items-center">
                    <RadialGauge percentage={(dashboardQuery.data.preventiveCount / dashboardQuery.data.totalCount) * 100} size={88} tone="success" />
                    <p className="mt-1.5 text-center text-[11px] text-ink-subtle">% preventivas</p>
                  </div>
                )}
                <div className="flex-1 overflow-hidden rounded-lg border border-border">
                  <DataTable columns={typeColumns} data={dashboardQuery.data.byType} emptyTitle="Sem manutenções no período/filtro." />
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Por prioridade" />
              <DataTable columns={priorityColumns} data={dashboardQuery.data.byPriority} emptyTitle="Sem manutenções no período/filtro." />
            </Card>
          </div>

          <Card>
            <CardHeader title="Por oficina" />
            <DataTable columns={workshopColumns} data={dashboardQuery.data.byWorkshop} emptyTitle="Sem manutenções no período/filtro." />
          </Card>

          {/* ===== 4. Custos por componente ===== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Por componente" />
              <DataTable columns={componentColumns} data={dashboardQuery.data.byComponent} emptyTitle="Sem manutenções no período/filtro." />
            </Card>
            <BarRankingChart
              title="Top 5 componentes por custo"
              data={dashboardQuery.data.topComponentsByCost.map((c) => ({ label: componentLabel(c.component), value: c.cost }))}
              color="#d97706"
              emptyMessage="Nenhum componente com manutenção no período/filtro selecionado."
            />
          </div>

          {/* ===== 2. Evolucao mensal ===== */}
          <MonthlyChartCard title="Evolução mensal do custo de manutenção" data={dashboardQuery.data.monthlyTrend} color="#d97706" />

          {/* ===== 3. Custos por veiculo + 6. Rankings ===== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Top 5 veículos por custo de manutenção"
              data={dashboardQuery.data.topVehiclesByCost.map((v) => ({ label: v.plate, value: v.value }))}
              color="#d97706"
              emptyMessage="Nenhum veículo com manutenção no período/filtro selecionado."
            />
            <BarRankingChart
              title="Menor custo de manutenção"
              data={dashboardQuery.data.bottomVehiclesByCost.map((v) => ({ label: v.plate, value: v.value }))}
              color="#16a34a"
              emptyMessage="Nenhum veículo com manutenção no período/filtro selecionado."
            />
            <BarRankingChart
              title="Top 5 veículos por nº de manutenções"
              data={dashboardQuery.data.topVehiclesByCount.map((v) => ({ label: v.plate, value: v.value }))}
              color="#0891b2"
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhum veículo com manutenção no período/filtro selecionado."
            />
            <BarRankingChart
              title="Top 5 veículos por tempo parado"
              data={dashboardQuery.data.topVehiclesByDowntime.map((v) => ({ label: v.plate, value: v.value }))}
              color="#dc2626"
              valueFormatter={(v) => `${formatNumber(v)} min`}
              emptyMessage="Nenhum veículo com tempo parado registrado no período/filtro selecionado."
            />
          </div>

          {/* ===== 7. Alertas ===== */}
          <Card>
            <CardHeader
              title="Alertas de manutenção"
              description="Vencidas, custo/quebra/tempo parado acima da média da frota e itens críticos em aberto."
              action={
                dashboardQuery.data.maintenanceAlerts.length > 0 ? (
                  <Badge tone="danger">{dashboardQuery.data.maintenanceAlerts.length} alerta(s)</Badge>
                ) : undefined
              }
            />
            {dashboardQuery.data.maintenanceAlerts.length === 0 ? (
              <div className="flex items-center gap-2 p-5 text-sm text-ink-muted">
                <Info size={16} />
                Nenhum alerta no período/filtro selecionado.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {dashboardQuery.data.maintenanceAlerts.map((alert, index) => (
                  <li key={`${alert.type}-${alert.vehicleId}-${index}`} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <ShieldAlert size={16} className="shrink-0 text-ink-subtle" />
                      <div>
                        <p className="text-sm font-medium text-ink">{alert.plate}</p>
                        <p className="text-xs text-ink-muted">{alert.message}</p>
                      </div>
                    </div>
                    <Badge tone={alert.severity === 'CRITICAL' ? 'danger' : alert.severity === 'ATTENTION' ? 'warning' : 'info'}>
                      {alert.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ===== 8/9. Proximas manutencoes / vencidas ===== */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Manutenções vencidas" />
              <DataTable columns={planStatusColumns} data={dashboardQuery.data.overdueMaintenances} emptyTitle="Nenhuma manutenção vencida." />
            </Card>
            <Card>
              <CardHeader title="Próximas manutenções" />
              <DataTable columns={planStatusColumns} data={dashboardQuery.data.upcomingMaintenances} emptyTitle="Nenhuma manutenção próxima do vencimento." />
            </Card>
          </div>
        </div>
      )}

      {/* ===== 10. Tabela completa de registros ===== */}
      <div className="mt-8">
        <CardHeader title="Registros de manutenção" description="Lista completa, com filtros por tipo/status/prioridade/componente/fornecedor." />

        <FilterBar
          hasActiveFilters={hasListFilters}
          onClear={() => {
            setType('');
            setStatus('');
            setPriority('');
            setComponent('');
            setSupplier('');
            setPage(1);
          }}
        >
          <FormField label="Tipo" htmlFor="fmaint-type" className="w-full sm:w-40">
            <Select id="fmaint-type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
              <option value="">Todos</option>
              {TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status" htmlFor="fmaint-status" className="w-full sm:w-40">
            <Select id="fmaint-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Todos</option>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Prioridade" htmlFor="fmaint-priority" className="w-full sm:w-36">
            <Select id="fmaint-priority" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
              <option value="">Todas</option>
              {PRIORITY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Componente" htmlFor="fmaint-component" className="w-full sm:w-44">
            <Select id="fmaint-component" value={component} onChange={(e) => { setComponent(e.target.value); setPage(1); }}>
              <option value="">Todos</option>
              {COMPONENT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Fornecedor" htmlFor="fmaint-supplier" className="w-full sm:w-44">
            <input
              id="fmaint-supplier"
              className="h-9 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-ink"
              value={supplier}
              onChange={(e) => { setSupplier(e.target.value); setPage(1); }}
            />
          </FormField>
        </FilterBar>

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={recordColumns}
            data={listQuery.data?.items ?? []}
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            onRetry={() => listQuery.refetch()}
            getRowId={(m) => m.id}
            onRowClick={(record) => setSelectedRecord(record)}
            emptyTitle="Nenhuma manutenção encontrada para o período/filtro selecionado."
          />
          {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
        </div>
      </div>

      {/* ===== 11. Gestao dos planos preventivos ===== */}
      <div className="mt-8">
        <MaintenancePlansSection vehicleId={vehicleId} />
      </div>

      {selectedRecord && (
        <Modal open onClose={() => setSelectedRecord(null)} title="Detalhe da manutenção" size="lg">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <DetailRow label="Tipo" value={MAINTENANCE_TYPE_LABELS[selectedRecord.type]} />
            <DetailRow label="Status" value={MAINTENANCE_STATUS_LABELS[selectedRecord.status]} />
            <DetailRow label="Prioridade" value={MAINTENANCE_PRIORITY_LABELS[selectedRecord.priority]} />
            <DetailRow label="Componente" value={componentLabel(selectedRecord.component)} />
            <DetailRow label="Abertura" value={formatDateTime(selectedRecord.openedAt)} />
            <DetailRow label="Conclusão" value={selectedRecord.completedAt ? formatDateTime(selectedRecord.completedAt) : 'Em aberto'} />
            <DetailRow label="Oficina" value={selectedRecord.workshop ?? 'Não informada'} />
            <DetailRow label="Fornecedor" value={selectedRecord.supplier ?? 'Não informado'} />
            <DetailRow label="Mecânico" value={selectedRecord.mechanic ?? 'Não informado'} />
            <DetailRow label="Nota fiscal" value={selectedRecord.invoiceNumber ?? 'Não informada'} />
            <DetailRow label="OS" value={selectedRecord.serviceOrderNumber ?? 'Não informada'} />
            <DetailRow label="Odômetro" value={selectedRecord.odometerKm === null ? 'Não informado' : `${formatNumber(selectedRecord.odometerKm)} km`} />
            <DetailRow label="Próximo odômetro" value={selectedRecord.nextOdometerKm === null ? 'Não informado' : `${formatNumber(selectedRecord.nextOdometerKm)} km`} />
            <DetailRow label="Tempo parado" value={selectedRecord.downtimeMinutes === null ? 'Não informado' : `${formatNumber(selectedRecord.downtimeMinutes)} min`} />
            <DetailRow label="Mão de obra" value={selectedRecord.laborCost === null ? '—' : formatCurrency(selectedRecord.laborCost)} />
            <DetailRow label="Peças" value={selectedRecord.partsCost === null ? '—' : formatCurrency(selectedRecord.partsCost)} />
            <DetailRow label="Total" value={selectedRecord.totalCost === null ? '—' : formatCurrency(selectedRecord.totalCost)} />
            <DetailRow label="Observação" value={selectedRecord.notes ?? 'Nenhuma'} />
          </dl>
          {selectedRecord.parts.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Peças</h3>
              <DataTable
                columns={[
                  { header: 'Item', accessorFn: (row) => row.name },
                  { header: 'Qtd.', accessorFn: (row) => formatNumber(row.quantity) },
                  { header: 'Unit.', cell: ({ row }) => formatCurrency(row.original.unitPrice) },
                  { header: 'Total', cell: ({ row }) => formatCurrency(row.original.totalPrice) },
                ]}
                data={selectedRecord.parts}
                emptyTitle="Nenhuma peça."
              />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-subtle">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}
