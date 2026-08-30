'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { DataTable } from '../../../components/ui/data-table';
import { EntitySelect } from '../../../components/ui/entity-select';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { CHECKLIST_STATUS_LABELS, CHECKLIST_STATUS_TONE, CHECKLIST_TYPE_LABELS } from '../../../features/checklists/status';
import { listChecklistExecutions } from '../../../lib/api/checklist.api';
import { listVehicles } from '../../../lib/api/fleet.api';
import type { ChecklistExecutionEntity } from '../../../types/entities';
import type { ChecklistExecutionStatus } from '../../../types/enums';
import { formatDateTime } from '../../../utils/format';

const PAGE_SIZE = 20;

// Fase 111 -- primeira visao administrativa do modulo de checklist (ver
// docs/checklist-module.md, Fase 38/39: "sem tela nesta fase" para os
// endpoints /checklists/*). Listagem so-leitura das execucoes -- criacao
// acontece sempre pelo Driver App (POST driver/checklists), nunca aqui.
export default function ChecklistsPage(): JSX.Element {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [vehicleId, setVehicleId] = useState('');
  const [status, setStatus] = useState<ChecklistExecutionStatus | ''>('');

  const listQuery = useQuery({
    queryKey: ['checklists', 'executions', 'list', { page, vehicleId, status }],
    queryFn: ({ signal }) =>
      listChecklistExecutions(
        { page, pageSize: PAGE_SIZE, vehicleId: vehicleId || undefined, status: status || undefined },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<ChecklistExecutionEntity, unknown>[]>(
    () => [
      {
        header: 'Checklist',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.templateName}</p>
            <p className="text-xs text-ink-subtle">{CHECKLIST_TYPE_LABELS[row.original.templateType]}</p>
          </div>
        ),
      },
      {
        header: 'Veículo / Motorista',
        cell: ({ row }) => (
          <div>
            <p className="text-sm text-ink">{row.original.vehiclePlate ?? '—'}</p>
            <p className="text-xs text-ink-subtle">{row.original.driverName ?? '—'}</p>
          </div>
        ),
      },
      { header: 'Início', cell: ({ row }) => formatDateTime(row.original.startedAt) },
      {
        header: 'Status',
        cell: ({ row }) => <Badge tone={CHECKLIST_STATUS_TONE[row.original.status]}>{CHECKLIST_STATUS_LABELS[row.original.status]}</Badge>,
      },
      {
        header: 'Não conformidade crítica',
        cell: ({ row }) => (
          <Badge tone={row.original.hasCriticalNonConformity ? 'danger' : 'success'}>
            {row.original.hasCriticalNonConformity ? 'Sim' : 'Não'}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader title="Checklists" description="Execuções de checklist pré-viagem e pós-viagem registradas pelo motorista." />

      <FilterBar
        hasActiveFilters={Boolean(vehicleId || status)}
        onClear={() => {
          setVehicleId('');
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Veículo" htmlFor="checklist-vehicle" className="w-full sm:w-64">
          <EntitySelect
            id="checklist-vehicle"
            queryKey={['vehicles', 'select']}
            queryFn={() => listVehicles({ pageSize: 100 })}
            getOptionValue={(v) => v.id}
            getOptionLabel={(v) => `${v.plate} · ${v.brand} ${v.model}`}
            value={vehicleId}
            onChange={(v) => {
              setVehicleId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Status" htmlFor="checklist-status" className="w-full sm:w-48">
          <Select
            id="checklist-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ChecklistExecutionStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(CHECKLIST_STATUS_LABELS) as ChecklistExecutionStatus[]).map((s) => (
              <option key={s} value={s}>
                {CHECKLIST_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          onRowClick={(execution) => router.push(`/checklists/${execution.id}`)}
          getRowId={(execution) => execution.id}
          emptyTitle="Nenhum checklist registrado"
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
