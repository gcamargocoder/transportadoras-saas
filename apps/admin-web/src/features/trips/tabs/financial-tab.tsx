'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { PayableDetailModal } from '../../payables/payable-detail-modal';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { listPayables } from '../../../lib/api/payables.api';
import {
  closeTripSettlement,
  getTripFinancialDashboard,
  getTripFinancialResult,
  getTripSettlement,
  reopenTripSettlement,
} from '../../../lib/api/trips.api';
import { TRIP_SETTLEMENT_CLOSE_ROLES, hasRole } from '../../../lib/auth/roles';
import { EXPENSE_CATEGORY_LABELS, PAYABLE_STATUS_LABELS, PAYABLE_STATUS_TONE, SETTLEMENT_STATUS_LABELS } from '../../../lib/labels';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from '../../../utils/format';

export function FinancialTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedPayableId, setSelectedPayableId] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ['trips', tripId, 'financial-dashboard'],
    queryFn: () => getTripFinancialDashboard(tripId),
  });

  const settlementQuery = useQuery({
    queryKey: ['trips', tripId, 'settlement'],
    queryFn: () => getTripSettlement(tripId),
  });

  const resultQuery = useQuery({
    queryKey: ['trips', tripId, 'financial-result'],
    queryFn: () => getTripFinancialResult(tripId),
  });

  // Fase 73 -- vinculo Despesas -> Contas a pagar -> Pagamentos. Nao
  // altera nenhum campo do "Resultado financeiro" (Fase 71) acima: custo
  // operacional (TripExpense/financial-result) e pagamento financeiro
  // (Payable/PayablePayment) sao conceitos distintos, ver docs/payables.md.
  const payablesQuery = useQuery({
    queryKey: ['payables', 'list', { tripId }],
    queryFn: () => listPayables({ tripId, pageSize: 50 }),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeTripSettlement(tripId),
    onSuccess: () => {
      toast.success('Acerto da viagem fechado.');
      queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'settlement'] });
    },
    onError: (error) => toast.error('Não foi possível fechar o acerto.', toFriendlyMessage(error)),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenTripSettlement(tripId),
    onSuccess: () => {
      toast.success('Acerto da viagem reaberto.');
      queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'settlement'] });
    },
    onError: (error) => toast.error('Não foi possível reabrir o acerto.', toFriendlyMessage(error)),
  });

  if (dashboardQuery.isLoading || settlementQuery.isLoading)
    return <LoadingState label="Carregando financeiro" />;
  if (dashboardQuery.isError || !dashboardQuery.data)
    return <ErrorState onRetry={() => dashboardQuery.refetch()} />;

  const financial = dashboardQuery.data;
  const settlement = settlementQuery.data;
  const canManage = hasRole(user?.role, TRIP_SETTLEMENT_CLOSE_ROLES);

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Receitas" value={formatCurrency(financial.totalRevenue)} tone="success" />
        <StatCard
          label="Despesas aprovadas"
          value={formatCurrency(financial.totalExpenses)}
          tone="danger"
        />
        <StatCard label="Adiantamentos" value={formatCurrency(financial.totalAdvances)} />
        <StatCard
          label="Resultado líquido"
          value={formatCurrency(financial.netResult)}
          tone={financial.netResult >= 0 ? 'success' : 'danger'}
        />
        <StatCard label="Lucro" value={formatCurrency(financial.profit)} />
        <StatCard label="Margem" value={formatPercent(financial.marginPercentage)} />
      </div>

      {resultQuery.data && (
        <Card className="mt-6">
          <CardHeader
            title="Resultado financeiro"
            description="Receita contratada, faturada e recebida contra os custos reais da viagem — combustível, pedágio e despesas."
          />
          <CardBody>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Receita</p>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Contratado"
                  value={
                    resultQuery.data.contractedRevenue !== null
                      ? formatCurrency(resultQuery.data.contractedRevenue)
                      : '—'
                  }
                />
                <StatCard label="Faturado" value={formatCurrency(resultQuery.data.invoicedRevenue)} tone="info" />
                <StatCard label="Recebido" value={formatCurrency(resultQuery.data.receivedRevenue)} tone="success" />
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Custos</p>
              <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Combustível" value={formatCurrency(resultQuery.data.fuelCost)} tone="danger" />
                <StatCard label="Pedágio" value={formatCurrency(resultQuery.data.tollCost)} tone="danger" />
                <StatCard label="Despesas" value={formatCurrency(resultQuery.data.expenseCost)} tone="danger" />
                <StatCard label="Total" value={formatCurrency(resultQuery.data.totalCost)} tone="danger" />
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Resultado</p>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Resultado operacional"
                  value={
                    resultQuery.data.operatingResult !== null
                      ? formatCurrency(resultQuery.data.operatingResult)
                      : '—'
                  }
                  tone={
                    resultQuery.data.operatingResult === null
                      ? 'brand'
                      : resultQuery.data.operatingResult >= 0
                        ? 'success'
                        : 'danger'
                  }
                />
                <StatCard
                  label="Margem"
                  value={
                    resultQuery.data.profitMarginPercent !== null
                      ? formatPercent(resultQuery.data.profitMarginPercent)
                      : '—'
                  }
                />
                <StatCard
                  label="Resultado por km"
                  value={resultQuery.data.profitPerKm !== null ? formatCurrency(resultQuery.data.profitPerKm) : '—'}
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-subtle">Distância real</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {resultQuery.data.distanceKm !== null ? `${formatNumber(resultQuery.data.distanceKm, 1)} km` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Receita/km</p>
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {resultQuery.data.revenuePerKm !== null ? formatCurrency(resultQuery.data.revenuePerKm) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Custo/km</p>
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {resultQuery.data.costPerKm !== null ? formatCurrency(resultQuery.data.costPerKm) : '—'}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {payablesQuery.data && payablesQuery.data.items.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Contas a pagar"
            description="Títulos gerados a partir das despesas aprovadas desta viagem — pagamento financeiro, distinto do custo operacional acima."
          />
          <ul className="divide-y divide-border">
            {payablesQuery.data.items.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {p.description}
                  <span className="ml-2 text-xs text-ink-subtle">
                    {EXPENSE_CATEGORY_LABELS[p.category]} · vence {formatDate(p.dueDate)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-ink-subtle">
                    {formatCurrency(p.paidAmount)} / {formatCurrency(p.originalAmount)}
                  </span>
                  <Badge tone={PAYABLE_STATUS_TONE[p.status]}>{PAYABLE_STATUS_LABELS[p.status]}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setSelectedPayableId(p.id)}>
                    Ver
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {settlement && (
        <Card className="mt-6">
          <CardHeader
            title="Acerto da viagem"
            description="Fechamento financeiro consolidado da viagem."
            action={
              <Badge
                tone={
                  settlement.status === 'CLOSED'
                    ? 'success'
                    : settlement.status === 'REOPENED'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {SETTLEMENT_STATUS_LABELS[settlement.status]}
              </Badge>
            }
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-subtle">Resultado líquido</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {formatCurrency(settlement.netResult)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Fechado por</p>
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {settlement.closedByName ?? '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Fechado em</p>
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {formatDateTime(settlement.closedAt)}
                </p>
              </div>
              {canManage && (
                <div className="flex items-end justify-end">
                  {settlement.status === 'CLOSED' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopenMutation.mutate()}
                      loading={reopenMutation.isPending}
                    >
                      <LockOpen size={14} />
                      Reabrir
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => closeMutation.mutate()}
                      loading={closeMutation.isPending}
                    >
                      <Lock size={14} />
                      Fechar acerto
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <PayableDetailModal
        open={selectedPayableId !== null}
        onClose={() => setSelectedPayableId(null)}
        payableId={selectedPayableId}
      />
    </div>
  );
}
