'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { DataTable } from '../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { AuditDetailDrawer } from '../../../../../features/finance-audit/audit-detail-drawer';
import { getFinanceAudit } from '../../../../../lib/api/finance-audit.api';
import { FINANCE_AUDIT_ACTION_LABELS, FINANCE_AUDIT_ENTITY_NAME_LABELS } from '../../../../../lib/labels';
import type { AuditLogEntity } from '../../../../../types/entities';
import { formatDateTime } from '../../../../../utils/format';

const PAGE_SIZE = 20;
const ENTITY_NAMES = Object.keys(FINANCE_AUDIT_ENTITY_NAME_LABELS);
const ACTIONS = Object.keys(FINANCE_AUDIT_ACTION_LABELS);

export default function FinanceAuditPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [entityName, setEntityName] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditLogEntity | null>(null);

  const filters = {
    entityName: entityName || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const hasActiveFilters = Boolean(entityName || action || from || to);

  const query = useQuery({
    queryKey: ['finance-audit', 'list', { page, ...filters }],
    queryFn: () => getFinanceAudit({ page, pageSize: PAGE_SIZE, ...filters }),
  });

  const columns: ColumnDef<AuditLogEntity, unknown>[] = [
    { header: 'Data/hora', cell: ({ row }) => formatDateTime(row.original.createdAt) },
    {
      header: 'Ação',
      cell: ({ row }) => <Badge tone="info">{FINANCE_AUDIT_ACTION_LABELS[row.original.action] ?? row.original.action}</Badge>,
    },
    {
      header: 'Entidade',
      cell: ({ row }) => FINANCE_AUDIT_ENTITY_NAME_LABELS[row.original.entityName] ?? row.original.entityName,
    },
    { header: 'Entidade (ID)', cell: ({ row }) => <span className="font-mono text-xs">{row.original.entityId}</span> },
    { header: 'Usuário (ID)', cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId ?? '—'}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Auditoria financeira"
        description="Rastreabilidade das mutações de contas a receber/pagar e períodos financeiros -- leitura sobre o mesmo registro de auditoria (AuditLog) usado no resto do sistema, nunca editável ou excluível por aqui."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setEntityName('');
          setAction('');
          setFrom('');
          setTo('');
          setPage(1);
        }}
      >
        <FormField label="Entidade" htmlFor="audit-entity" className="w-full sm:w-48">
          <Select
            id="audit-entity"
            value={entityName}
            onChange={(e) => {
              setEntityName(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {ENTITY_NAMES.map((e) => (
              <option key={e} value={e}>
                {FINANCE_AUDIT_ENTITY_NAME_LABELS[e]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Ação" htmlFor="audit-action" className="w-full sm:w-56">
          <Select
            id="audit-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {FINANCE_AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="audit-from" className="w-full sm:w-40">
          <DatePicker
            id="audit-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="audit-to" className="w-full sm:w-40">
          <DatePicker
            id="audit-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(row) => setSelected(row)}
          getRowId={(r) => r.id}
          emptyTitle="Nenhum evento encontrado"
          emptyDescription="Ajuste os filtros ou aguarde novas mutações financeiras."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <AuditDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
