'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { History, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import { EntitySelect } from '../../components/ui/entity-select';
import { FilterBar } from '../../components/ui/filter-bar';
import { FormField } from '../../components/ui/form-field';
import { useAuth } from '../../hooks/use-auth';
import { listFreightRules, listFreightTables } from '../../lib/api/freight.api';
import { FREIGHT_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { FREIGHT_RULE_STATUS_LABELS, FREIGHT_RULE_STATUS_TONE, VEHICLE_TYPE_LABELS } from '../../lib/labels';
import type { FreightRuleEntity } from '../../types/entities';
import { FreightRuleStatus } from '../../types/enums';
import { formatCurrency, formatDate } from '../../utils/format';
import { FreightRuleFormModal } from './freight-rule-form-modal';

export function FreightRulesPanel({
  initialTableId,
}: {
  initialTableId?: string | undefined;
}): JSX.Element {
  const { user } = useAuth();
  const [freightTableId, setFreightTableId] = useState(initialTableId ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const [revising, setRevising] = useState<FreightRuleEntity | null>(null);

  useEffect(() => {
    if (initialTableId) setFreightTableId(initialTableId);
  }, [initialTableId]);

  const query = useQuery({
    queryKey: ['freight', 'rules', { freightTableId }],
    queryFn: ({ signal }) => listFreightRules({ freightTableId: freightTableId || undefined, pageSize: 100 }, signal),
    enabled: Boolean(freightTableId),
  });

  const columns = useMemo<ColumnDef<FreightRuleEntity, unknown>[]>(
    () => [
      { header: 'Versão', accessorFn: (row) => `v${row.version}` },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={FREIGHT_RULE_STATUS_TONE[row.original.status]}>
            {FREIGHT_RULE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        header: 'Critérios',
        cell: ({ row }) => {
          const r = row.original;
          const parts = [
            r.originRegion && `origem ${r.originRegion}`,
            r.destinationRegion && `destino ${r.destinationRegion}`,
            r.cargoType && `carga ${r.cargoType}`,
            r.vehicleType && VEHICLE_TYPE_LABELS[r.vehicleType],
            (r.minWeightKg !== null || r.maxWeightKg !== null) &&
              `${r.minWeightKg ?? 0}–${r.maxWeightKg ?? '∞'} kg`,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(' · ') : 'Sem restrição (regra genérica)';
        },
      },
      { header: 'Base', cell: ({ row }) => formatCurrency(row.original.baseAmount) },
      { header: 'Por km', cell: ({ row }) => (row.original.perKmAmount !== null ? formatCurrency(row.original.perKmAmount) : '—') },
      { header: 'Vigência', cell: ({ row }) => `${formatDate(row.original.effectiveFrom)} — ${row.original.effectiveUntil ? formatDate(row.original.effectiveUntil) : 'atual'}` },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) =>
          row.original.status === FreightRuleStatus.ACTIVE && hasRole(user?.role, FREIGHT_WRITE_ROLES) ? (
            <Button variant="ghost" size="sm" onClick={() => setRevising(row.original)}>
              <History size={14} />
              Revisar
            </Button>
          ) : null,
      },
    ],
    [user?.role],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-subtle">
          Regras de precificação por tabela, versionadas — editar nunca altera a versão já usada por uma viagem.
        </p>
        {hasRole(user?.role, FREIGHT_WRITE_ROLES) && freightTableId && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nova regra
          </Button>
        )}
      </div>

      <FilterBar hasActiveFilters={false}>
        <FormField label="Tabela de frete" htmlFor="rule-filter-table" className="w-full sm:w-72">
          <EntitySelect
            id="rule-filter-table"
            queryKey={['freight', 'tables', 'select']}
            queryFn={() => listFreightTables({ pageSize: 100 })}
            getOptionValue={(t) => t.id}
            getOptionLabel={(t) => `${t.code} — ${t.name}`}
            value={freightTableId}
            onChange={setFreightTableId}
            placeholder="Selecione uma tabela"
          />
        </FormField>
      </FilterBar>

      {freightTableId ? (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={columns}
            data={query.data?.items ?? []}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            getRowId={(r) => r.id}
            emptyTitle="Nenhuma regra cadastrada nesta tabela"
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-ink-subtle">
          Selecione uma tabela de frete para ver/editar suas regras.
        </p>
      )}

      <FreightRuleFormModal open={createOpen} onClose={() => setCreateOpen(false)} freightTableId={freightTableId} />
      <FreightRuleFormModal open={revising !== null} onClose={() => setRevising(null)} revisingRule={revising} />
    </div>
  );
}
