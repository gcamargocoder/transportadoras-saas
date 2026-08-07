'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  closeTripSettlement,
  getTripFinancialDashboard,
  getTripSettlement,
  reopenTripSettlement,
} from '../../../lib/api/trips.api';
import { TRIP_SETTLEMENT_CLOSE_ROLES, hasRole } from '../../../lib/auth/roles';
import { SETTLEMENT_STATUS_LABELS } from '../../../lib/labels';
import { formatCurrency, formatDateTime, formatPercent } from '../../../utils/format';

export function FinancialTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ['trips', tripId, 'financial-dashboard'],
    queryFn: () => getTripFinancialDashboard(tripId),
  });

  const settlementQuery = useQuery({
    queryKey: ['trips', tripId, 'settlement'],
    queryFn: () => getTripSettlement(tripId),
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
    </div>
  );
}
