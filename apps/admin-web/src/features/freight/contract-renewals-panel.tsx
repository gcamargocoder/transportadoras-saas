'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { CardHeader } from '../../components/ui/card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { DataTable } from '../../components/ui/data-table';
import { EntitySelect } from '../../components/ui/entity-select';
import { FilterBar } from '../../components/ui/filter-bar';
import { FormField } from '../../components/ui/form-field';
import { Pagination } from '../../components/ui/pagination';
import { Select } from '../../components/ui/select';
import { StatCard } from '../../components/ui/stat-card';
import { useAuth } from '../../hooks/use-auth';
import {
  cancelContractRenewal,
  getContractRenewalSummary,
  listContractRenewals,
  listExpiringContracts,
} from '../../lib/api/contract-renewals.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { FREIGHT_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import {
  CONTRACT_EXPIRY_STATUS_LABELS,
  CONTRACT_EXPIRY_STATUS_TONE,
  CONTRACT_RENEWAL_STATUS_LABELS,
  CONTRACT_RENEWAL_STATUS_TONE,
  labelOrValue,
} from '../../lib/labels';
import { listCustomers } from '../../lib/api/trips.api';
import type { ContractRenewalEntity, RenewalExpiringContractEntity } from '../../types/entities';
import type { ContractRenewalStatus } from '../../types/enums';
import { formatDate, formatDateTime } from '../../utils/format';
import { useToast } from '../../components/ui/toast';
import { CompleteRenewalModal } from './complete-renewal-modal';
import { InitiateRenewalModal } from './initiate-renewal-modal';

const PAGE_SIZE = 20;
const WITHIN_DAYS_OPTIONS = [7, 15, 30, 60, 90];

export function ContractRenewalsPanel(): JSX.Element {
  const { user } = useAuth();
  const canWrite = hasRole(user?.role, FREIGHT_WRITE_ROLES);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [customerId, setCustomerId] = useState('');
  const [withinDays, setWithinDays] = useState(30);
  const [expiringPage, setExpiringPage] = useState(1);

  const [status, setStatus] = useState<ContractRenewalStatus | ''>('');
  const [renewalsPage, setRenewalsPage] = useState(1);

  const [initiateTarget, setInitiateTarget] = useState<RenewalExpiringContractEntity | null>(null);
  const [completeTarget, setCompleteTarget] = useState<ContractRenewalEntity | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContractRenewalEntity | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['contract-renewals', 'summary', { customerId }],
    queryFn: () => getContractRenewalSummary({ customerId: customerId || undefined }),
  });

  const expiringQuery = useQuery({
    queryKey: ['contract-renewals', 'expiring-contracts', { customerId, withinDays, page: expiringPage }],
    queryFn: ({ signal }) =>
      listExpiringContracts(
        { customerId: customerId || undefined, withinDays, page: expiringPage, pageSize: PAGE_SIZE },
        signal,
      ),
  });

  const renewalsQuery = useQuery({
    queryKey: ['contract-renewals', 'list', { customerId, status, page: renewalsPage }],
    queryFn: ({ signal }) =>
      listContractRenewals(
        { customerId: customerId || undefined, status: status || undefined, page: renewalsPage, pageSize: PAGE_SIZE },
        signal,
      ),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelContractRenewal(id),
    onSuccess: () => {
      toast.success('Renovação cancelada.');
      queryClient.invalidateQueries({ queryKey: ['contract-renewals'] });
      setCancelTarget(null);
    },
    onError: (error) => toast.error('Não foi possível cancelar a renovação.', toFriendlyMessage(error)),
  });

  const expiringColumns = useMemo<ColumnDef<RenewalExpiringContractEntity, unknown>[]>(
    () => [
      { header: 'Código', accessorFn: (row) => row.code },
      { header: 'Cliente', accessorFn: (row) => row.customerName },
      {
        header: 'Vencimento',
        cell: ({ row }) => (
          <span>
            {formatDate(row.original.endDate)}{' '}
            <span className="text-ink-subtle">
              ({row.original.daysUntilExpiry >= 0 ? `${row.original.daysUntilExpiry}d` : `${Math.abs(row.original.daysUntilExpiry)}d atrás`})
            </span>
          </span>
        ),
      },
      {
        header: 'Situação',
        cell: ({ row }) => (
          <Badge tone={CONTRACT_EXPIRY_STATUS_TONE[row.original.expiryStatus]}>
            {labelOrValue(CONTRACT_EXPIRY_STATUS_LABELS, row.original.expiryStatus)}
          </Badge>
        ),
      },
      {
        header: 'Renovação',
        cell: ({ row }) =>
          row.original.hasActiveRenewal ? (
            <Badge tone="warning">Em andamento</Badge>
          ) : canWrite ? (
            <Button variant="outline" size="sm" onClick={() => setInitiateTarget(row.original)}>
              <RefreshCw size={14} />
              Renovar
            </Button>
          ) : (
            '—'
          ),
      },
    ],
    [canWrite],
  );

  const renewalsColumns = useMemo<ColumnDef<ContractRenewalEntity, unknown>[]>(
    () => [
      { header: 'Contrato anterior', accessorFn: (row) => row.previousContractCode ?? '—' },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={CONTRACT_RENEWAL_STATUS_TONE[row.original.status]}>
            {CONTRACT_RENEWAL_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      { header: 'Vigência anterior', cell: ({ row }) => (row.original.previousEndDate ? formatDate(row.original.previousEndDate) : '—') },
      {
        header: 'Novo contrato / nova vigência',
        cell: ({ row }) =>
          row.original.newContractCode ? (
            <span>
              {row.original.newContractCode} ({formatDate(row.original.newStartDate)}
              {row.original.newEndDate ? ` – ${formatDate(row.original.newEndDate)}` : ''})
            </span>
          ) : (
            '—'
          ),
      },
      {
        header: 'Iniciada em',
        cell: ({ row }) => (
          <span className="text-ink-subtle">
            {formatDateTime(row.original.initiatedAt)} {row.original.initiatorName ? `· ${row.original.initiatorName}` : ''}
          </span>
        ),
      },
      {
        header: 'Ações',
        cell: ({ row }) =>
          canWrite && row.original.status === 'PENDING' ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCompleteTarget(row.original)}>
                Concluir
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCancelTarget(row.original)}>
                Cancelar
              </Button>
            </div>
          ) : (
            '—'
          ),
      },
    ],
    [canWrite],
  );

  const hasActiveFilters = Boolean(customerId);

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setCustomerId('');
          setExpiringPage(1);
          setRenewalsPage(1);
        }}
      >
        <FormField label="Cliente" htmlFor="renewal-filter-customer" className="w-full sm:w-56">
          <EntitySelect
            id="renewal-filter-customer"
            queryKey={['customers', 'select']}
            queryFn={() => listCustomers({ pageSize: 100 })}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => c.name}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setExpiringPage(1);
              setRenewalsPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
      </FilterBar>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Contratos vencendo"
          value={summaryQuery.data ? String(summaryQuery.data.expiringCount) : '—'}
          tone="warning"
        />
        <StatCard
          label="Contratos vencidos"
          value={summaryQuery.data ? String(summaryQuery.data.expiredCount) : '—'}
          tone="danger"
        />
        <StatCard
          label="Renovações em andamento"
          value={summaryQuery.data ? String(summaryQuery.data.pendingRenewalsCount) : '—'}
          tone="info"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <CardHeader
          title="Contratos vencendo/vencidos"
          description="Contratos ACTIVE ou EXPIRED com vencimento dentro do período selecionado (inclui os já vencidos)."
          action={
            <FormField label="Período" htmlFor="renewal-within-days" className="w-40">
              <Select
                id="renewal-within-days"
                value={String(withinDays)}
                onChange={(e) => {
                  setWithinDays(Number(e.target.value));
                  setExpiringPage(1);
                }}
              >
                {WITHIN_DAYS_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    Próximos {d} dias
                  </option>
                ))}
              </Select>
            </FormField>
          }
        />
        <DataTable
          columns={expiringColumns}
          data={expiringQuery.data?.items ?? []}
          isLoading={expiringQuery.isLoading}
          isError={expiringQuery.isError}
          onRetry={() => expiringQuery.refetch()}
          getRowId={(r) => r.contractId}
          emptyTitle="Nenhum contrato vencendo ou vencido no período/filtro selecionado"
        />
        {expiringQuery.data && <Pagination meta={expiringQuery.data.meta} onPageChange={setExpiringPage} />}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <CardHeader
          title="Histórico de renovações"
          description="Vigência anterior e nova a cada renovação — a vigência anterior nunca é sobrescrita."
          action={
            <FormField label="Status" htmlFor="renewal-filter-status" className="w-40">
              <Select
                id="renewal-filter-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as ContractRenewalStatus | '');
                  setRenewalsPage(1);
                }}
              >
                <option value="">Todos</option>
                {(Object.keys(CONTRACT_RENEWAL_STATUS_LABELS) as ContractRenewalStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CONTRACT_RENEWAL_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
          }
        />
        <DataTable
          columns={renewalsColumns}
          data={renewalsQuery.data?.items ?? []}
          isLoading={renewalsQuery.isLoading}
          isError={renewalsQuery.isError}
          onRetry={() => renewalsQuery.refetch()}
          getRowId={(r) => r.id}
          emptyTitle="Nenhuma renovação encontrada no filtro selecionado"
        />
        {renewalsQuery.data && <Pagination meta={renewalsQuery.data.meta} onPageChange={setRenewalsPage} />}
      </div>

      <InitiateRenewalModal
        open={initiateTarget !== null}
        onClose={() => setInitiateTarget(null)}
        contractId={initiateTarget?.contractId ?? null}
        contractCode={initiateTarget?.code}
      />
      <CompleteRenewalModal open={completeTarget !== null} onClose={() => setCompleteTarget(null)} renewal={completeTarget} />
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        title="Cancelar renovação"
        description={`Cancelar a renovação do contrato ${cancelTarget?.previousContractCode ?? ''}? O contrato anterior não é alterado.`}
        confirmLabel="Cancelar renovação"
        danger
        loading={cancelMutation.isPending}
      />
    </div>
  );
}
