'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  MapPinOff,
  Milestone,
  Plus,
  Receipt,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { EntitySelect } from '../../../components/ui/entity-select';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { useAuth } from '../../../hooks/use-auth';
import { AUDIT_VERDICT_LABELS, AUDIT_VERDICT_TONE } from '../../../features/tolls/audit-verdict';
import { CreateTollModal } from '../../../features/tolls/create-toll-modal';
import { ImportStatementModal } from '../../../features/tolls/import-statement-modal';
import { PlazaPicker } from '../../../features/tolls/plaza-picker';
import { TripPicker } from '../../../features/tolls/trip-picker';
import { listDrivers } from '../../../lib/api/drivers.api';
import { listVehicles } from '../../../lib/api/fleet.api';
import { getTollDashboard, listTollTransactions } from '../../../lib/api/tolls.api';
import { getTollReconciliationDashboard } from '../../../lib/api/toll-routes.api';
import { hasRole, TOLL_IMPORT_WRITE_ROLES, TOLL_WRITE_ROLES } from '../../../lib/auth/roles';
import { RECONCILIATION_STATUS_LABELS } from '../../../features/tolls/reconciliation-verdict';
import type { TollPlazaEntity, TollTransactionEntity, TripEntity } from '../../../types/entities';
import type { TollAuditVerdict } from '../../../types/entities';
import { formatCurrency, formatDateTime, formatPercent } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function TollsPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [auditVerdict, setAuditVerdict] = useState<TollAuditVerdict | ''>('');
  const [chargedFrom, setChargedFrom] = useState('');
  const [chargedTo, setChargedTo] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<TripEntity | null>(null);
  const [selectedPlaza, setSelectedPlaza] = useState<TollPlazaEntity | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filters = {
    auditVerdict: auditVerdict || undefined,
    chargedFrom: chargedFrom || undefined,
    chargedTo: chargedTo || undefined,
    vehicleId: vehicleId || undefined,
    driverId: driverId || undefined,
    tripId: selectedTrip?.id,
    tollPlazaId: selectedPlaza?.id,
  };

  const dashboardQuery = useQuery({
    queryKey: ['toll-transactions', 'dashboard', filters],
    queryFn: ({ signal }) => getTollDashboard(filters, signal),
  });

  // Conciliacao (Fase 23) -- agregado por VIAGEM (distinto do dashboard
  // acima, que e agregado por TRANSACAO). Nao aceita os mesmos filtros
  // (veiculo/motorista/praca/periodo) por ser um agregado tenant-wide
  // simples; ver GET /toll-routes/dashboard.
  const reconciliationDashboardQuery = useQuery({
    queryKey: ['toll-routes', 'dashboard'],
    queryFn: ({ signal }) => getTollReconciliationDashboard(signal),
  });

  const listQuery = useQuery({
    queryKey: ['toll-transactions', 'list', { page, ...filters }],
    queryFn: ({ signal }) =>
      listTollTransactions({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<TollTransactionEntity, unknown>[]>(
    () => [
      { header: 'Praça', accessorFn: (row) => row.tollPlazaName },
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? '-' },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '-' },
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.chargedAt) },
      { header: 'Cobrado', cell: ({ row }) => formatCurrency(row.original.chargedAmount) },
      {
        header: 'Esperado',
        cell: ({ row }) =>
          row.original.auditVerdict === 'UNVERIFIABLE'
            ? '-'
            : formatCurrency(row.original.expectedAmount),
      },
      {
        header: 'Divergência',
        cell: ({ row }) => {
          if (row.original.auditVerdict === 'UNVERIFIABLE') {
            return <span className="text-ink-subtle">-</span>;
          }
          const value = row.original.discrepancyAmount;
          if (Math.abs(value) < 0.01) return <span className="text-ink-subtle">-</span>;
          return (
            <span
              className={value > 0 ? 'font-medium text-danger-600' : 'font-medium text-warning-600'}
            >
              {value > 0 ? '+' : ''}
              {formatCurrency(value)}
            </span>
          );
        },
      },
      {
        header: 'Conferência',
        cell: ({ row }) => (
          <Badge
            tone={AUDIT_VERDICT_TONE[row.original.auditVerdict]}
            dot={
              row.original.auditVerdict === 'OVERCHARGE' ||
              row.original.auditVerdict === 'UNDERCHARGE'
            }
          >
            {AUDIT_VERDICT_LABELS[row.original.auditVerdict]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const hasActiveFilters = Boolean(
    auditVerdict ||
    chargedFrom ||
    chargedTo ||
    vehicleId ||
    driverId ||
    selectedTrip ||
    selectedPlaza,
  );

  function clearFilters() {
    setAuditVerdict('');
    setChargedFrom('');
    setChargedTo('');
    setVehicleId('');
    setDriverId('');
    setSelectedTrip(null);
    setSelectedPlaza(null);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Pedágios"
        description="Transações de pedágio e conferência entre valor cobrado e esperado."
        actions={
          <>
            {hasRole(user?.role, TOLL_IMPORT_WRITE_ROLES) && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <UploadCloud size={16} />
                Importar extrato
              </Button>
            )}
            {hasRole(user?.role, TOLL_WRITE_ROLES) && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Registrar pedágio
              </Button>
            )}
          </>
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Transações"
            value={String(dashboardQuery.data.totalCount)}
            icon={Receipt}
          />
          <StatCard
            label="Total cobrado"
            value={formatCurrency(dashboardQuery.data.totalChargedAmount)}
          />
          <StatCard
            label="Conformidade"
            value={
              dashboardQuery.data.conferredCount > 0
                ? formatPercent(dashboardQuery.data.conformityPercentage)
                : '-'
            }
            icon={CheckCircle2}
            tone={dashboardQuery.data.conformityPercentage >= 90 ? 'success' : 'warning'}
          />
          <StatCard
            label="Não foi possível conferir"
            value={String(dashboardQuery.data.unverifiableCount)}
            icon={HelpCircle}
            tone={dashboardQuery.data.unverifiableCount > 0 ? 'warning' : 'success'}
          />
        </div>
      )}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Cobranças corretas"
            value={String(dashboardQuery.data.correctCount)}
            tone="success"
          />
          <StatCard
            label="Acima do esperado"
            value={String(dashboardQuery.data.overchargeCount)}
            icon={AlertTriangle}
            tone={dashboardQuery.data.overchargeCount > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label="Abaixo do esperado"
            value={String(dashboardQuery.data.underchargeCount)}
            tone={dashboardQuery.data.underchargeCount > 0 ? 'warning' : 'success'}
          />
        </div>
      )}

      {reconciliationDashboardQuery.data &&
        reconciliationDashboardQuery.data.totalTripsWithRoute > 0 && (
          <div className="mb-6">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              <Milestone size={13} />
              Conciliação por rota de pedágio (viagens com rota vinculada)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Viagens conciliadas"
                value={String(reconciliationDashboardQuery.data.reconciledTripsCount)}
                icon={CheckCircle2}
                tone="success"
              />
              <StatCard
                label="Viagens não conciliadas"
                value={String(reconciliationDashboardQuery.data.nonReconciledTripsCount)}
                icon={AlertTriangle}
                tone={
                  reconciliationDashboardQuery.data.nonReconciledTripsCount > 0
                    ? 'warning'
                    : 'success'
                }
              />
              <StatCard
                label="Praças não registradas"
                value={String(reconciliationDashboardQuery.data.totalNotRegisteredStops)}
                icon={MapPinOff}
                tone={
                  reconciliationDashboardQuery.data.totalNotRegisteredStops > 0
                    ? 'warning'
                    : 'success'
                }
              />
              <StatCard
                label="Pedágios não previstos"
                value={`${reconciliationDashboardQuery.data.totalUnplannedTransactions} · ${formatCurrency(reconciliationDashboardQuery.data.totalUnplannedAmount)}`}
                icon={ShieldAlert}
                tone={
                  reconciliationDashboardQuery.data.totalUnplannedTransactions > 0
                    ? 'danger'
                    : 'success'
                }
              />
            </div>

            <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Status geral das viagens (conciliação automática — Fase 24)
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard
                label={RECONCILIATION_STATUS_LABELS.PENDING}
                value={String(reconciliationDashboardQuery.data.pendingTripsCount)}
                icon={Clock}
                tone="brand"
              />
              <StatCard
                label={RECONCILIATION_STATUS_LABELS.CONFORM}
                value={String(reconciliationDashboardQuery.data.conformTripsCount)}
                icon={CheckCircle2}
                tone="success"
              />
              <StatCard
                label={RECONCILIATION_STATUS_LABELS.ATTENTION}
                value={String(reconciliationDashboardQuery.data.attentionTripsCount)}
                icon={AlertTriangle}
                tone={
                  reconciliationDashboardQuery.data.attentionTripsCount > 0 ? 'warning' : 'success'
                }
              />
              <StatCard
                label={RECONCILIATION_STATUS_LABELS.CRITICAL}
                value={String(reconciliationDashboardQuery.data.criticalTripsCount)}
                icon={ShieldAlert}
                tone={
                  reconciliationDashboardQuery.data.criticalTripsCount > 0 ? 'danger' : 'success'
                }
              />
              <StatCard
                label={RECONCILIATION_STATUS_LABELS.UNVERIFIABLE}
                value={String(reconciliationDashboardQuery.data.unverifiableTripsCount)}
                icon={HelpCircle}
                tone={
                  reconciliationDashboardQuery.data.unverifiableTripsCount > 0 ? 'info' : 'success'
                }
              />
            </div>
          </div>
        )}

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
        <FormField label="Conferência" htmlFor="toll-verdict" className="w-full sm:w-48">
          <Select
            id="toll-verdict"
            value={auditVerdict}
            onChange={(e) => {
              setAuditVerdict(e.target.value as TollAuditVerdict | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(AUDIT_VERDICT_LABELS) as TollAuditVerdict[]).map((v) => (
              <option key={v} value={v}>
                {AUDIT_VERDICT_LABELS[v]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Veículo" htmlFor="toll-vehicle" className="w-full sm:w-48">
          <EntitySelect
            id="toll-vehicle"
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
        <FormField label="Motorista" htmlFor="toll-driver" className="w-full sm:w-48">
          <EntitySelect
            id="toll-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100, isActive: true })}
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
        <FormField label="Viagem" htmlFor="toll-trip" className="w-full sm:w-56">
          <TripPicker
            id="toll-trip"
            selectedTrip={selectedTrip}
            onSelect={(trip) => {
              setSelectedTrip(trip);
              setPage(1);
            }}
            onClear={() => {
              setSelectedTrip(null);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Praça" htmlFor="toll-plaza" className="w-full sm:w-56">
          <PlazaPicker
            id="toll-plaza"
            selectedPlaza={selectedPlaza}
            onSelect={(plaza) => {
              setSelectedPlaza(plaza);
              setPage(1);
            }}
            onClear={() => {
              setSelectedPlaza(null);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="De" htmlFor="toll-from" className="w-full sm:w-40">
          <DatePicker
            id="toll-from"
            value={chargedFrom}
            onChange={(e) => {
              setChargedFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="toll-to" className="w-full sm:w-40">
          <DatePicker
            id="toll-to"
            value={chargedTo}
            onChange={(e) => {
              setChargedTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          getRowId={(t) => t.id}
          emptyTitle="Nenhum pedágio encontrado"
          emptyDescription="Não existem transações de pedágio para os filtros selecionados."
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <CreateTollModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportStatementModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
