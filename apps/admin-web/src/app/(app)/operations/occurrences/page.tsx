'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Loader2, MoreHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { DataTable } from '../../../../components/ui/data-table';
import { Dropdown } from '../../../../components/ui/dropdown';
import { ErrorState } from '../../../../components/ui/error-state';
import { FilterBar } from '../../../../components/ui/filter-bar';
import { FormField } from '../../../../components/ui/form-field';
import { Input } from '../../../../components/ui/input';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { Select } from '../../../../components/ui/select';
import { SkeletonCards } from '../../../../components/ui/skeleton';
import { StatCard } from '../../../../components/ui/stat-card';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import {
  cancelOccurrence,
  getOccurrencesDashboard,
  listOccurrences,
  markOccurrenceInProgress,
  resolveOccurrence,
} from '../../../../lib/api/trips.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../../../lib/auth/roles';
import {
  labelOrValue,
  TRIP_OCCURRENCE_SEVERITY_LABELS,
  TRIP_OCCURRENCE_STATUS_LABELS,
  TRIP_OCCURRENCE_TYPE_LABELS,
} from '../../../../lib/labels';
import { TRIP_OCCURRENCE_SEVERITY_TONE, TRIP_OCCURRENCE_STATUS_TONE } from '../../../../features/trips/status';
import type { DeliveryOccurrenceListItemEntity } from '../../../../types/entities';
import type { TripOccurrenceSeverity, TripOccurrenceStatus, TripOccurrenceType } from '../../../../types/enums';
import { formatDateTime } from '../../../../utils/format';

const PAGE_SIZE = 20;

// Fase 115 -- Gestao de Excecoes Operacionais: visao CROSS-TRIP de TODAS as
// TripOccurrence (Fase 67), gerais e de entrega. Reaproveita integralmente
// TripOccurrence -- nenhuma entidade/logica nova; e o MESMO padrao ja
// aprovado em /operations/delivery-occurrences (Fase 101), so sem a
// restricao a paradas. A aba "Ocorrências" da propria viagem continua a
// fonte operacional principal por viagem; esta pagina e a visao consolidada
// para triagem entre viagens. Distinta do dashboard estatistico/historico
// em /operations/fleet/occurrences (contagens/ranking/tendencia mensal, sem
// lista acionavel por item, sem resolver/cancelar).
export default function OccurrencesPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);

  const [type, setType] = useState<TripOccurrenceType | ''>('');
  const [severity, setSeverity] = useState<TripOccurrenceSeverity | ''>('');
  const [status, setStatus] = useState<TripOccurrenceStatus | ''>('');
  const [search, setSearch] = useState('');
  const [occurredFrom, setOccurredFrom] = useState('');
  const [occurredTo, setOccurredTo] = useState('');
  const [page, setPage] = useState(1);

  const hasActiveFilters = Boolean(type || severity || status || search || occurredFrom || occurredTo);

  const filters = {
    type: type || undefined,
    severity: severity || undefined,
    search: search || undefined,
    occurredFrom: occurredFrom || undefined,
    occurredTo: occurredTo || undefined,
  };

  const dashboardQuery = useQuery({
    queryKey: ['trip-occurrences', 'dashboard', filters],
    queryFn: ({ signal }) => getOccurrencesDashboard(filters, signal),
  });

  const listQuery = useQuery({
    queryKey: ['trip-occurrences', 'list', { ...filters, status, page }],
    queryFn: ({ signal }) => listOccurrences({ ...filters, status: status || undefined, page, pageSize: PAGE_SIZE }, signal),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['trip-occurrences'] });
  };

  const startMutation = useMutation({
    mutationFn: (id: string) => markOccurrenceInProgress(id),
    onSuccess: () => {
      toast.success('Ocorrência marcada como em andamento.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível atualizar a ocorrência.', toFriendlyMessage(error)),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveOccurrence(id),
    onSuccess: () => {
      toast.success('Ocorrência resolvida.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível resolver a ocorrência.', toFriendlyMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelOccurrence(id),
    onSuccess: () => {
      toast.success('Ocorrência cancelada.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível cancelar a ocorrência.', toFriendlyMessage(error)),
  });

  const columns = useMemo<ColumnDef<DeliveryOccurrenceListItemEntity, unknown>[]>(
    () => [
      {
        header: 'Viagem',
        cell: ({ row }) => (
          <div className="text-xs">
            <div>
              {row.original.tripOriginName} → {row.original.tripDestinationName}
            </div>
            <div className="text-ink-subtle">
              {row.original.tripDeliveryStopSequence !== null
                ? `Parada #${row.original.tripDeliveryStopSequence}`
                : 'Ocorrência geral da viagem'}
            </div>
          </div>
        ),
      },
      {
        header: 'Motorista/Veículo',
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 text-xs">
            {row.original.driverId ? (
              <Link href={`/drivers/${row.original.driverId}`} className="text-brand-600 hover:underline">
                {row.original.driverName ?? 'Motorista'}
              </Link>
            ) : (
              <span className="text-ink-subtle">—</span>
            )}
            {row.original.vehicleId && (
              <Link href={`/vehicles/${row.original.vehicleId}`} className="text-brand-600 hover:underline">
                {row.original.vehiclePlate ?? 'Veículo'}
              </Link>
            )}
          </div>
        ),
      },
      { header: 'Tipo', accessorFn: (row) => TRIP_OCCURRENCE_TYPE_LABELS[row.type] },
      {
        header: 'Severidade',
        cell: ({ row }) => (
          <Badge tone={TRIP_OCCURRENCE_SEVERITY_TONE[row.original.severity]}>
            {TRIP_OCCURRENCE_SEVERITY_LABELS[row.original.severity]}
          </Badge>
        ),
      },
      { header: 'Descrição', accessorFn: (row) => row.description },
      { header: 'Quando', cell: ({ row }) => formatDateTime(row.original.occurredAt) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TRIP_OCCURRENCE_STATUS_TONE[row.original.status]}>
            {TRIP_OCCURRENCE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      ...(canWrite
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: DeliveryOccurrenceListItemEntity } }) => {
                const s = row.original.status;
                if (s !== 'OPEN' && s !== 'IN_PROGRESS') return null;
                return (
                  <Dropdown
                    trigger={
                      <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                        <MoreHorizontal size={16} />
                      </span>
                    }
                    items={[
                      ...(s === 'OPEN'
                        ? [
                            {
                              label: 'Marcar em andamento',
                              icon: <Loader2 size={14} />,
                              onClick: () => startMutation.mutate(row.original.id),
                            },
                          ]
                        : []),
                      {
                        label: 'Resolver',
                        icon: <Check size={14} />,
                        onClick: () => resolveMutation.mutate(row.original.id),
                      },
                      {
                        label: 'Cancelar registro',
                        icon: <X size={14} />,
                        danger: true,
                        onClick: () => cancelMutation.mutate(row.original.id),
                      },
                    ]}
                  />
                );
              },
            } satisfies ColumnDef<DeliveryOccurrenceListItemEntity, unknown>,
          ]
        : []),
    ],
    [canWrite, startMutation, resolveMutation, cancelMutation],
  );

  const summary = dashboardQuery.data;

  return (
    <div>
      <PageHeader
        title="Ocorrências Operacionais"
        description="Visão consolidada de todas as ocorrências registradas durante as viagens (gerais e de entrega) — busca, filtros, paginação, indicadores e tratamento."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setType('');
          setSeverity('');
          setStatus('');
          setSearch('');
          setOccurredFrom('');
          setOccurredTo('');
          setPage(1);
        }}
      >
        <FormField label="Busca" htmlFor="occurrences-search" className="w-full sm:w-56">
          <Input
            id="occurrences-search"
            placeholder="Descrição..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Tipo" htmlFor="occurrences-type" className="w-full sm:w-48">
          <Select
            id="occurrences-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as TripOccurrenceType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(TRIP_OCCURRENCE_TYPE_LABELS) as TripOccurrenceType[]).map((t) => (
              <option key={t} value={t}>
                {labelOrValue(TRIP_OCCURRENCE_TYPE_LABELS, t)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Severidade" htmlFor="occurrences-severity" className="w-full sm:w-40">
          <Select
            id="occurrences-severity"
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as TripOccurrenceSeverity | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(TRIP_OCCURRENCE_SEVERITY_LABELS) as TripOccurrenceSeverity[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(TRIP_OCCURRENCE_SEVERITY_LABELS, s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="occurrences-status" className="w-full sm:w-40">
          <Select
            id="occurrences-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TripOccurrenceStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(TRIP_OCCURRENCE_STATUS_LABELS) as TripOccurrenceStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(TRIP_OCCURRENCE_STATUS_LABELS, s)}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      {dashboardQuery.isLoading && <SkeletonCards count={6} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={String(summary.totalCount)} />
          <StatCard label="Em aberto" value={String(summary.openCount)} tone="warning" />
          <StatCard label="Em andamento" value={String(summary.inProgressCount)} tone="info" />
          <StatCard label="Resolvidas" value={String(summary.resolvedCount)} tone="success" />
          <StatCard label="Canceladas" value={String(summary.cancelledCount)} />
          <StatCard label="Críticas em aberto" value={String(summary.criticalOpenCount)} tone="danger" />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/trips/${r.tripId}?tab=occurrences`)}
          emptyTitle="Nenhuma ocorrência encontrada no filtro selecionado"
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
