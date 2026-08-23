'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Ban, CheckCircle2, Pencil, PowerOff } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { DataTable } from '../../../../components/ui/data-table';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { StatCard } from '../../../../components/ui/stat-card';
import { Tabs } from '../../../../components/ui/tabs';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import {
  getVehicleDocuments,
  getVehicleFuelHistory,
  getVehicleMaintenances,
  getVehicleOverview,
  getVehicleTags,
  updateVehicleStatus,
} from '../../../../lib/api/fleet.api';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { listFiscalDocuments } from '../../../../lib/api/fiscal.api';
import { listTrips } from '../../../../lib/api/trips.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { MAINTENANCE_STATUS_TONE, VEHICLE_STATUS_TONE } from '../../../../features/fleet/status';
import { TRIP_STATUS_TONE } from '../../../../features/trips/status';
import { UpdateVehicleModal } from '../../../../features/fleet/update-vehicle-modal';
import {
  DOCUMENT_EXPIRY_STATUS_LABELS,
  DOCUMENT_EXPIRY_STATUS_TONE,
  DOCUMENT_TYPE_LABELS,
  FISCAL_DOCUMENT_TYPE_LABELS,
  FLEET_ALERT_SEVERITY_TONE,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
  TIRE_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  VEHICLE_AVAILABILITY_LABELS,
  VEHICLE_AVAILABILITY_TONE,
  VEHICLE_FUEL_TYPE_LABELS,
  VEHICLE_OWNERSHIP_TYPE_LABELS,
  VEHICLE_OWNERSHIP_TYPE_TONE,
  VEHICLE_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
} from '../../../../lib/labels';
import { TIRE_STATUS_TONE } from '../../../../features/tires/status';
import type { FuelSupplyEntity, MaintenanceEntity, VehicleTagEntity, VehicleTireSummaryEntity } from '../../../../types/entities';
import type { VehicleStatus } from '../../../../types/enums';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from '../../../../utils/format';

const RECENT_TRIPS_LIMIT = 10;

type TabValue = 'overview' | 'driver' | 'trips' | 'tires' | 'documents' | 'costs' | 'history';

export default function VehicleDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<TabValue>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);

  // GET /vehicles/:id/overview -- 1 unica chamada consolidando motorista
  // atual, viagem atual, indicadores, documentos, alertas, historico de
  // motoristas, viagens recentes e auditoria (Fase 62).
  const overviewQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'overview'],
    queryFn: () => getVehicleOverview(vehicleId),
  });

  const maintenancesQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'maintenances'],
    queryFn: () => getVehicleMaintenances(vehicleId, { pageSize: 50 }),
    enabled: tab === 'costs',
  });

  const fuelHistoryQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'fuel-history'],
    queryFn: () => getVehicleFuelHistory(vehicleId, 50),
    enabled: tab === 'costs',
  });

  const tagsQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'tags'],
    queryFn: () => getVehicleTags(vehicleId),
    enabled: tab === 'overview',
  });

  const documentsQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'documents'],
    queryFn: () => getVehicleDocuments(vehicleId),
    enabled: tab === 'documents',
  });

  const fiscalDocumentsQuery = useQuery({
    queryKey: ['vehicles', vehicleId, 'fiscal-documents'],
    queryFn: () => listFiscalDocuments({ vehicleId, pageSize: 10 }),
    enabled: tab === 'documents',
  });

  const tripsQuery = useQuery({
    queryKey: ['trips', { vehicleId, pageSize: RECENT_TRIPS_LIMIT }],
    queryFn: () => listTrips({ vehicleId, pageSize: RECENT_TRIPS_LIMIT, sortBy: 'createdAt', sortOrder: 'desc' }),
    enabled: tab === 'trips',
  });

  const statusMutation = useMutation({
    mutationFn: (status: VehicleStatus) => updateVehicleStatus(vehicleId, status),
    onSuccess: () => {
      toast.success('Status do veículo atualizado.');
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
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

  const tireColumns = useMemo<ColumnDef<VehicleTireSummaryEntity, unknown>[]>(
    () => [
      { header: 'Posição', accessorFn: (row) => row.position ?? '-' },
      { header: 'Identificação', accessorFn: (row) => row.fireNumber },
      { header: 'Fabricante/Modelo', accessorFn: (row) => `${row.manufacturer} ${row.model}` },
      {
        header: 'Sulco atual',
        cell: ({ row }) =>
          row.original.currentTreadDepthMm !== null ? `${formatNumber(row.original.currentTreadDepthMm, 1)} mm` : '-',
      },
      { header: 'Instalado desde', cell: ({ row }) => (row.original.installedAt ? formatDate(row.original.installedAt) : '-') },
      {
        header: 'Status',
        cell: ({ row }) => <Badge tone={TIRE_STATUS_TONE[row.original.status]}>{TIRE_STATUS_LABELS[row.original.status]}</Badge>,
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

  if (overviewQuery.isLoading) return <LoadingState label="Carregando veículo" />;
  if (overviewQuery.isError || !overviewQuery.data)
    return <ErrorState onRetry={() => overviewQuery.refetch()} />;

  const overview = overviewQuery.data;
  const vehicle = overview.vehicle;

  return (
    <div>
      <PageHeader
        title={vehicle.plate}
        description={`${vehicle.brand} ${vehicle.model} · ${VEHICLE_TYPE_LABELS[vehicle.type]}`}
        breadcrumb={[{ label: 'Veículos', href: '/vehicles' }, { label: vehicle.plate }]}
        actions={
          <>
            <Badge tone={VEHICLE_OWNERSHIP_TYPE_TONE[vehicle.ownershipType]}>
              {VEHICLE_OWNERSHIP_TYPE_LABELS[vehicle.ownershipType]}
            </Badge>
            <Badge tone={VEHICLE_STATUS_TONE[vehicle.status]}>{VEHICLE_STATUS_LABELS[vehicle.status]}</Badge>
            <Badge tone={VEHICLE_AVAILABILITY_TONE[vehicle.availability]}>
              {VEHICLE_AVAILABILITY_LABELS[vehicle.availability]}
            </Badge>
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
          <Button
            size="sm"
            variant="outline"
            disabled={vehicle.status === 'ACTIVE' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('ACTIVE')}
          >
            <CheckCircle2 size={14} />
            Ativar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={vehicle.status === 'SUSPENDED' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('SUSPENDED')}
          >
            <Ban size={14} />
            Suspender
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={vehicle.status === 'INACTIVE' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('INACTIVE')}
          >
            <PowerOff size={14} />
            Desativar
          </Button>
        </div>
      )}

      {overview.alerts.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Alertas" description="Situações que merecem atenção neste veículo." />
          <CardBody>
            <ul className="flex flex-col gap-2">
              {overview.alerts.map((alert, index) => (
                <li
                  key={`${alert.type}-${index}`}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <AlertTriangle size={16} className="shrink-0 text-warning-600" />
                  <Badge tone={FLEET_ALERT_SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
                  <span className="text-ink">{alert.message}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'driver', label: 'Motorista' },
          { value: 'trips', label: 'Viagens' },
          { value: 'tires', label: 'Pneus' },
          { value: 'documents', label: 'Documentos' },
          { value: 'costs', label: 'Custos' },
          { value: 'history', label: 'Histórico' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        {tab === 'overview' && (
          <div>
            <CardBody>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Odômetro" value={`${formatNumber(vehicle.odometerKm)} km`} />
                <Field
                  label="Combustível"
                  value={vehicle.fuelType ? VEHICLE_FUEL_TYPE_LABELS[vehicle.fuelType] : '-'}
                />
                <Field
                  label="Consumo médio"
                  value={vehicle.averageConsumptionKmL ? `${formatNumber(vehicle.averageConsumptionKmL, 1)} km/L` : '-'}
                />
                <Field
                  label="Capacidade do tanque"
                  value={vehicle.tankCapacityLiters ? `${formatNumber(vehicle.tankCapacityLiters)} L` : '-'}
                />
                <Field
                  label="Ano fabricação/modelo"
                  value={`${vehicle.manufactureYear ?? '-'} / ${vehicle.modelYear ?? '-'}`}
                />
                <Field label="Renavam" value={vehicle.renavam ?? '-'} />
                <Field label="Chassi" value={vehicle.chassisNumber ?? '-'} />
                <Field label="Eixos" value={vehicle.axleCount ? String(vehicle.axleCount) : '-'} />
              </div>
              {vehicle.notes && (
                <div className="mt-4">
                  <p className="text-xs text-ink-subtle">Observações</p>
                  <p className="mt-0.5 text-sm text-ink">{vehicle.notes}</p>
                </div>
              )}
            </CardBody>
            <div className="border-t border-border">
              <CardHeader title="Tags de pedágio" className="px-5" />
              <DataTable
                columns={tagColumns}
                data={tagsQuery.data ?? []}
                isLoading={tagsQuery.isLoading}
                isError={tagsQuery.isError}
                emptyTitle="Nenhuma tag vinculada"
              />
            </div>
          </div>
        )}

        {tab === 'driver' && (
          <div>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold text-ink">Motorista atual</h3>
              {overview.currentDriver ? (
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className="font-medium text-ink">{overview.currentDriver.driverName}</span>
                  <Badge tone="neutral">{overview.currentDriver.driverType}</Badge>
                  <Badge tone={overview.currentDriver.driverStatus === 'ACTIVE' ? 'success' : 'warning'}>
                    {overview.currentDriver.driverStatus}
                  </Badge>
                  <span className="text-ink-subtle">desde {formatDate(overview.currentDriver.startedAt)}</span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">Nenhum motorista vinculado no momento.</p>
              )}
            </div>
            <div>
              <CardHeader title="Histórico de motoristas" className="px-5" />
              {overview.driverHistory.length === 0 ? (
                <EmptyState title="Nenhum motorista vinculado ainda" />
              ) : (
                <ul className="divide-y divide-border">
                  {overview.driverHistory.map((assignment) => (
                    <li key={assignment.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className="min-w-0 truncate">
                        {assignment.driverName ?? '—'}
                        {assignment.notes ? ` · ${assignment.notes}` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-ink-subtle">
                        {formatDate(assignment.startedAt)} — {assignment.endedAt ? formatDate(assignment.endedAt) : 'atual'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === 'trips' && (
          <div>
            {overview.currentTrip && (
              <div className="border-b border-border px-5 py-4">
                <h3 className="text-sm font-semibold text-ink">Viagem atual</h3>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className="text-ink">
                    {overview.currentTrip.originName} → {overview.currentTrip.destinationName}
                  </span>
                  <Badge tone={TRIP_STATUS_TONE[overview.currentTrip.status]}>
                    {TRIP_STATUS_LABELS[overview.currentTrip.status]}
                  </Badge>
                  {overview.currentTrip.driverName && (
                    <span className="text-ink-subtle">Motorista: {overview.currentTrip.driverName}</span>
                  )}
                </div>
              </div>
            )}
            {overview.currentTripInconsistent && (
              <div className="border-b border-border bg-danger-50 px-5 py-3 text-sm text-danger-700">
                Mais de uma viagem em andamento foi encontrada simultaneamente para este veículo — inconsistência de
                dados que precisa ser verificada manualmente.
              </div>
            )}
            {tripsQuery.isLoading && <LoadingState label="Carregando viagens" />}
            {tripsQuery.data && tripsQuery.data.items.length === 0 && (
              <EmptyState title="Nenhuma viagem registrada para este veículo" />
            )}
            {tripsQuery.data && tripsQuery.data.items.length > 0 && (
              <ul className="divide-y divide-border">
                {tripsQuery.data.items.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <a href={`/trips/${t.id}`} className="min-w-0 truncate text-brand-700 hover:underline">
                      {t.originName} → {t.destinationName}
                    </a>
                    <Badge tone={TRIP_STATUS_TONE[t.status]}>{TRIP_STATUS_LABELS[t.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'tires' && (
          <div>
            <DataTable
              columns={tireColumns}
              data={overview.tires}
              getRowId={(t) => t.tireId}
              emptyTitle="Nenhum pneu montado neste veículo"
              onRowClick={(t) => router.push(`/tires/${t.tireId}`)}
            />
            <p className="border-t border-border px-5 py-3 text-xs text-ink-subtle">
              Para instalar, retirar, transferir, recapar ou descartar um pneu, acesse o detalhe do pneu (clique na
              linha) — as ações completas de manutenção de pneus ficam concentradas lá para não duplicar fluxos.
            </p>
          </div>
        )}

        {tab === 'documents' && (
          <div className="flex flex-col gap-6 p-5">
            <div>
              <CardHeader
                title="Documentos"
                description="Documentos cadastrados do veículo (CRLV, ANTT, seguro, licenciamento, outros)."
                className="px-0"
              />
              {documentsQuery.isLoading && <LoadingState label="Carregando documentos" />}
              {documentsQuery.data && documentsQuery.data.length === 0 && (
                <EmptyState title="Nenhum documento cadastrado" />
              )}
              {documentsQuery.data && documentsQuery.data.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {documentsQuery.data.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-ink">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                      <span className="text-ink-muted">{doc.number ?? '-'}</span>
                      <span className="text-ink-subtle">Vence em {formatDate(doc.expiresAt)}</span>
                      <Badge tone={DOCUMENT_EXPIRY_STATUS_TONE[doc.expiryStatus]}>
                        {DOCUMENT_EXPIRY_STATUS_LABELS[doc.expiryStatus]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <CardHeader
                title="Documentos fiscais relacionados"
                description="CT-e, MDF-e, comprovantes de entrega e outros vinculados a este veículo."
                className="px-0"
              />
              {fiscalDocumentsQuery.data && fiscalDocumentsQuery.data.items.length === 0 && (
                <EmptyState title="Nenhum documento fiscal vinculado" />
              )}
              {fiscalDocumentsQuery.data && fiscalDocumentsQuery.data.items.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {fiscalDocumentsQuery.data.items.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-ink">{FISCAL_DOCUMENT_TYPE_LABELS[doc.documentType]}</span>
                      <span className="text-ink-muted">{doc.documentNumber ?? doc.fileName ?? '-'}</span>
                      <span className="text-ink-subtle">{doc.issueDate ? formatDateTime(doc.issueDate) : '-'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === 'costs' && (
          <div>
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Receita" value={formatCurrency(overview.metrics.totalRevenue)} />
              <StatCard label="Despesas" value={formatCurrency(overview.metrics.totalExpenses)} />
              <StatCard label="Custo total" value={formatCurrency(overview.metrics.totalCost)} />
              <StatCard
                label="Resultado"
                value={formatCurrency(overview.metrics.financialResult)}
                tone={overview.metrics.financialResult >= 0 ? 'success' : 'danger'}
              />
              <StatCard label="Margem" value={overview.metrics.marginPercent !== null ? formatPercent(overview.metrics.marginPercent) : '—'} />
            </div>
            <div className="border-t border-border">
              <CardHeader title="Manutenções" className="px-5" />
              <DataTable
                columns={maintenanceColumns}
                data={maintenancesQuery.data?.items ?? []}
                isLoading={maintenancesQuery.isLoading}
                isError={maintenancesQuery.isError}
                emptyTitle="Nenhuma manutenção registrada"
              />
            </div>
            <div className="border-t border-border">
              <CardHeader
                title="Abastecimentos"
                description="Totais e consumo médio consideram o histórico completo do veículo, não só os itens listados."
                className="px-5"
              />
              {fuelHistoryQuery.data && (
                <div className="grid grid-cols-2 gap-4 px-5 pb-4 sm:grid-cols-4">
                  <StatCard label="Litros abastecidos" value={`${formatNumber(fuelHistoryQuery.data.totalLiters, 1)} L`} />
                  <StatCard label="Custo com combustível" value={formatCurrency(fuelHistoryQuery.data.totalAmount)} />
                  <StatCard
                    label="Consumo médio"
                    value={
                      fuelHistoryQuery.data.averageConsumptionKmL !== null
                        ? `${formatNumber(fuelHistoryQuery.data.averageConsumptionKmL, 1)} km/L`
                        : '—'
                    }
                  />
                  <StatCard
                    label="Hodômetro"
                    value={fuelHistoryQuery.data.hasOdometerRegression ? 'Inconsistência detectada' : 'Sem inconsistências'}
                    tone={fuelHistoryQuery.data.hasOdometerRegression ? 'danger' : 'success'}
                  />
                </div>
              )}
              <DataTable
                columns={fuelColumns}
                data={fuelHistoryQuery.data?.items ?? []}
                isLoading={fuelHistoryQuery.isLoading}
                isError={fuelHistoryQuery.isError}
                emptyTitle="Nenhum abastecimento registrado"
              />
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div>
            {overview.history.length === 0 ? (
              <EmptyState title="Nenhum registro de auditoria" />
            ) : (
              <ul className="divide-y divide-border">
                {overview.history.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium text-ink">{entry.action}</span>
                    <span className="text-ink-subtle">{formatDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
