'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, Pencil, Play, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { Select } from '../../../components/ui/select';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreateMaintenanceModal } from '../../../features/fleet/create-maintenance-modal';
import { UpdateMaintenanceModal } from '../../../features/fleet/update-maintenance-modal';
import { MAINTENANCE_STATUS_TONE } from '../../../features/fleet/status';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { listMaintenances, updateMaintenanceStatus } from '../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import {
  MAINTENANCE_COMPONENT_LABELS,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
} from '../../../lib/labels';
import type { MaintenanceEntity } from '../../../types/entities';
import type {
  MaintenanceComponent,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
} from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

// Fase 63 -- so faz sentido oferecer a acao quando o status atual permite a
// transicao (COMPLETED/CANCELLED sao terminais no backend -- ver
// maintenance-status-transition.util.ts -- os botoes desaparecem sozinhos
// para uma manutencao ja encerrada, nunca dependem de um 409 para se
// esconder).
const NON_TERMINAL_STATUSES: VehicleMaintenanceStatus[] = ['OPEN', 'WAITING_PARTS', 'IN_PROGRESS'];

export default function MaintenancesPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [plate, setPlate] = useState('');
  const [status, setStatus] = useState<VehicleMaintenanceStatus | ''>('');
  const [type, setType] = useState<VehicleMaintenanceType | ''>('');
  const [priority, setPriority] = useState<VehicleMaintenancePriority | ''>('');
  const [component, setComponent] = useState<MaintenanceComponent | ''>('');
  const [openedFrom, setOpenedFrom] = useState('');
  const [openedTo, setOpenedTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MaintenanceEntity | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MaintenanceEntity | null>(null);
  const [completeTarget, setCompleteTarget] = useState<MaintenanceEntity | null>(null);
  const [completeDate, setCompleteDate] = useState('');
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);
  const debouncedSearch = useDebounce(search);
  const debouncedPlate = useDebounce(plate);
  const hasActiveFilters = Boolean(
    search || plate || status || type || priority || component || openedFrom || openedTo,
  );

  const query = useQuery({
    queryKey: [
      'maintenances',
      { page, search: debouncedSearch, plate: debouncedPlate, status, type, priority, component, openedFrom, openedTo },
    ],
    queryFn: ({ signal }) =>
      listMaintenances(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          plate: debouncedPlate || undefined,
          status: status || undefined,
          type: type || undefined,
          priority: priority || undefined,
          component: component || undefined,
          openedFrom: openedFrom || undefined,
          openedTo: openedTo || undefined,
        },
        signal,
      ),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next, completedAt }: { id: string; next: VehicleMaintenanceStatus; completedAt?: string }) =>
      updateMaintenanceStatus(id, next, completedAt),
    onSuccess: () => {
      toast.success('Status da manutenção atualizado.');
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setCancelTarget(null);
      setCompleteTarget(null);
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const columns = useMemo<ColumnDef<MaintenanceEntity, unknown>[]>(
    () => [
      {
        header: 'OS',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.serviceOrderNumber ?? '—'}</p>
            <p className="text-xs text-ink-subtle">{row.original.vehiclePlate ?? '—'}</p>
          </div>
        ),
      },
      { header: 'Tipo', accessorFn: (row) => MAINTENANCE_TYPE_LABELS[row.type] },
      {
        header: 'Prioridade',
        cell: ({ row }) => (
          <Badge tone={row.original.priority === 'CRITICAL' ? 'danger' : 'neutral'}>
            {MAINTENANCE_PRIORITY_LABELS[row.original.priority]}
          </Badge>
        ),
      },
      { header: 'Abertura', cell: ({ row }) => formatDate(row.original.openedAt) },
      { header: 'Previsão', cell: ({ row }) => (row.original.scheduledAt ? formatDate(row.original.scheduledAt) : '—') },
      { header: 'Conclusão', cell: ({ row }) => (row.original.completedAt ? formatDate(row.original.completedAt) : '—') },
      { header: 'Componente', accessorFn: (row) => (row.component ? MAINTENANCE_COMPONENT_LABELS[row.component] : '-') },
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
      ...(canWrite
        ? [
            {
              header: 'Ações',
              id: 'actions',
              cell: ({ row }: { row: { original: MaintenanceEntity } }) => {
                const m = row.original;
                const editable = NON_TERMINAL_STATUSES.includes(m.status);
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Editar"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTarget(m);
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    {m.status === 'OPEN' || m.status === 'WAITING_PARTS' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Iniciar"
                        disabled={statusMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          statusMutation.mutate({ id: m.id, next: 'IN_PROGRESS' });
                        }}
                      >
                        <Play size={14} />
                      </Button>
                    ) : null}
                    {editable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Concluir"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompleteDate(new Date().toISOString().slice(0, 10));
                          setCompleteTarget(m);
                        }}
                      >
                        <CheckCircle2 size={14} />
                      </Button>
                    ) : null}
                    {editable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Cancelar"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancelTarget(m);
                        }}
                      >
                        <Ban size={14} />
                      </Button>
                    ) : null}
                  </div>
                );
              },
            },
          ]
        : []),
    ],
    [canWrite, statusMutation],
  );

  return (
    <div>
      <PageHeader
        title="Manutenções"
        description="Ordens de manutenção da frota."
        actions={
          hasRole(user?.role, FLEET_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova manutenção
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setPlate('');
          setStatus('');
          setType('');
          setPriority('');
          setComponent('');
          setOpenedFrom('');
          setOpenedTo('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="maint-search" className="w-full sm:w-56">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nº OS, descrição, oficina..."
          />
        </FormField>
        <FormField label="Placa" htmlFor="maint-plate" className="w-full sm:w-32">
          <Input
            id="maint-plate"
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value);
              setPage(1);
            }}
            placeholder="ABC1D23"
          />
        </FormField>
        <FormField label="Status" htmlFor="maint-status" className="w-full sm:w-48">
          <Select
            id="maint-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as VehicleMaintenanceStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(MAINTENANCE_STATUS_LABELS) as VehicleMaintenanceStatus[]).map((s) => (
              <option key={s} value={s}>
                {MAINTENANCE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tipo" htmlFor="maint-type" className="w-full sm:w-40">
          <Select
            id="maint-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as VehicleMaintenanceType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(MAINTENANCE_TYPE_LABELS) as VehicleMaintenanceType[]).map((t) => (
              <option key={t} value={t}>
                {MAINTENANCE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Prioridade" htmlFor="maint-priority" className="w-full sm:w-40">
          <Select
            id="maint-priority"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as VehicleMaintenancePriority | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(MAINTENANCE_PRIORITY_LABELS) as VehicleMaintenancePriority[]).map((p) => (
              <option key={p} value={p}>
                {MAINTENANCE_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Componente" htmlFor="maint-component" className="w-full sm:w-48">
          <Select
            id="maint-component"
            value={component}
            onChange={(e) => {
              setComponent(e.target.value as MaintenanceComponent | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(MAINTENANCE_COMPONENT_LABELS) as MaintenanceComponent[]).map((c) => (
              <option key={c} value={c}>
                {MAINTENANCE_COMPONENT_LABELS[c]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Aberta de" htmlFor="maint-opened-from" className="w-full sm:w-40">
          <DatePicker
            id="maint-opened-from"
            value={openedFrom}
            onChange={(e) => {
              setOpenedFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Aberta até" htmlFor="maint-opened-to" className="w-full sm:w-40">
          <DatePicker
            id="maint-opened-to"
            value={openedTo}
            onChange={(e) => {
              setOpenedTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          onRowClick={(m) => router.push(`/maintenances/${m.id}`)}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          getRowId={(m) => m.id}
          emptyTitle="Nenhuma manutenção encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateMaintenanceModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {editTarget && (
        <UpdateMaintenanceModal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} maintenance={editTarget} />
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && statusMutation.mutate({ id: cancelTarget.id, next: 'CANCELLED' })}
        title="Cancelar manutenção"
        description="Esta manutenção será marcada como cancelada e não poderá mais ser alterada. Deseja continuar?"
        confirmLabel="Cancelar manutenção"
        danger
        loading={statusMutation.isPending}
      />

      <Modal
        open={Boolean(completeTarget)}
        onClose={() => setCompleteTarget(null)}
        title="Concluir manutenção"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCompleteTarget(null)} disabled={statusMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                completeTarget &&
                statusMutation.mutate({ id: completeTarget.id, next: 'COMPLETED', completedAt: completeDate })
              }
              loading={statusMutation.isPending}
              disabled={!completeDate}
            >
              Concluir
            </Button>
          </>
        }
      >
        <FormField label="Data de conclusão" htmlFor="completedAt" required>
          <Input
            id="completedAt"
            type="date"
            value={completeDate}
            onChange={(e) => setCompleteDate(e.target.value)}
          />
        </FormField>
        <p className="mt-2 text-xs text-ink-subtle">
          É necessário que a manutenção já tenha custo de mão de obra e/ou peças informado (edite antes, se preciso).
        </p>
      </Modal>
    </div>
  );
}
