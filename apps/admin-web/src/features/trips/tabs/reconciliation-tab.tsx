'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { DataTable } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { getTripTollReconciliation } from '../../../lib/api/trips.api';
import {
  RECONCILIATION_VERDICT_LABELS,
  RECONCILIATION_VERDICT_TONE,
} from '../../tolls/reconciliation-verdict';
import type {
  TollReconciliationStopEntity,
  TollReconciliationUnplannedEntity,
} from '../../../types/entities';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/format';

// Conciliacao de pedagio (Fase 23): compara, praca a praca e na ordem da
// rota, o que era ESPERADO com o que foi REGISTRADO na viagem. So existe
// quando a viagem tem uma rota vinculada (ver aba "Visao geral").
export function ReconciliationTab({ tripId }: { tripId: string }): JSX.Element {
  const query = useQuery({
    queryKey: ['trips', tripId, 'toll-reconciliation'],
    queryFn: () => getTripTollReconciliation(tripId),
  });

  const stopColumns = useMemo<ColumnDef<TollReconciliationStopEntity, unknown>[]>(
    () => [
      { header: '#', cell: ({ row }) => row.original.sequence },
      { header: 'Praça', accessorFn: (row) => row.tollPlazaName },
      {
        header: 'Esperado',
        cell: ({ row }) =>
          row.original.expectedAmount === null ? '-' : formatCurrency(row.original.expectedAmount),
      },
      {
        header: 'Cobrado',
        cell: ({ row }) =>
          row.original.chargedAmount === null ? '-' : formatCurrency(row.original.chargedAmount),
      },
      {
        header: 'Divergência',
        cell: ({ row }) =>
          row.original.discrepancyAmount === null
            ? '-'
            : formatCurrency(row.original.discrepancyAmount),
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={RECONCILIATION_VERDICT_TONE[row.original.verdict]}>
            {RECONCILIATION_VERDICT_LABELS[row.original.verdict]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const unplannedColumns = useMemo<ColumnDef<TollReconciliationUnplannedEntity, unknown>[]>(
    () => [
      { header: 'Praça', accessorFn: (row) => row.tollPlazaName },
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.chargedAt) },
      { header: 'Cobrado', cell: ({ row }) => formatCurrency(row.original.chargedAmount) },
    ],
    [],
  );

  if (query.isLoading) return <LoadingState label="Carregando conciliação" />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const recon = query.data;

  if (!recon.hasRoute) {
    return (
      <EmptyState
        title="Esta viagem não tem rota de pedágio vinculada"
        description="Vincule uma rota de pedágio na aba “Visão geral” para habilitar a conciliação entre praças esperadas e pedágios registrados."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader
          title={`Rota: ${recon.tollRouteName}`}
          description={`${recon.originLabel} → ${recon.destinationLabel}`}
          action={
            <Badge tone={recon.isFullyReconciled ? 'success' : 'warning'} dot>
              {recon.isFullyReconciled ? (
                <>
                  <CheckCircle2 size={12} />
                  100% conciliada
                </>
              ) : (
                <>
                  <AlertTriangle size={12} />
                  Com divergências
                </>
              )}
            </Badge>
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="Praças esperadas" value={String(recon.expectedStopsCount)} />
            <Field label="Praças registradas" value={String(recon.registeredStopsCount)} />
            <Field label="Valor esperado" value={formatCurrency(recon.expectedTotalAmount)} />
            <Field label="Valor cobrado" value={formatCurrency(recon.chargedTotalAmount)} />
            <Field label="Divergência" value={formatCurrency(recon.divergenceAmount)} />
            <Field label="Conformidade" value={`${formatNumber(recon.conformityPercentage, 1)}%`} />
          </div>
        </CardBody>
      </Card>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={stopColumns}
          data={recon.stops}
          getRowId={(s) => s.tollPlazaId}
          emptyTitle="Esta rota não tem praças cadastradas"
        />
      </div>

      {recon.unplannedTransactions.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning-700">
            <AlertTriangle size={12} />
            Pedágios não previstos pela rota ({recon.unplannedTransactions.length} ·{' '}
            {formatCurrency(recon.unplannedTotalAmount)})
          </p>
          <div className="overflow-hidden rounded-lg border border-warning-200 bg-white">
            <DataTable
              columns={unplannedColumns}
              data={recon.unplannedTransactions}
              getRowId={(u) => u.transactionId}
            />
          </div>
        </div>
      )}
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
