'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, CircleDot, Clock, ShieldAlert, Truck, UserRound, Users } from 'lucide-react';
import { ErrorState } from '../../components/ui/error-state';
import { PageHeader } from '../../components/ui/page-header';
import { SkeletonCards } from '../../components/ui/skeleton';
import { StatCard } from '../../components/ui/stat-card';
import { BarRankingChart } from '../../features/fleet-operations/bar-ranking-chart';
import { getPlatformDashboard } from '../../lib/api/super-admin.api';
import { TENANT_PLAN_TIER_LABELS, TENANT_STATUS_LABELS } from '../../lib/labels';
import { formatNumber } from '../../utils/format';

export default function SuperAdminDashboardPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['super-admin', 'dashboard'],
    queryFn: ({ signal }) => getPlatformDashboard(signal),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard da plataforma"
        description="Visão consolidada de todas as transportadoras clientes, com dados reais (sem filtro de período)."
      />

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de transportadoras" value={formatNumber(query.data.totalTenants)} icon={Building2} variant="gradient" />
            <StatCard label="Total de usuários" value={formatNumber(query.data.totalUsers)} icon={Users} />
            <StatCard label="Total de veículos" value={formatNumber(query.data.totalVehicles)} icon={Truck} />
            <StatCard label="Total de motoristas" value={formatNumber(query.data.totalDrivers)} icon={UserRound} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {query.data.byStatus.map((row) => (
              <StatCard
                key={row.status}
                label={TENANT_STATUS_LABELS[row.status]}
                value={formatNumber(row.count)}
                icon={row.status === 'SUSPENDED' || row.status === 'EXPIRED' ? ShieldAlert : CircleDot}
                tone={row.status === 'ACTIVE' ? 'success' : row.status === 'SUSPENDED' ? 'danger' : row.status === 'EXPIRED' ? 'warning' : 'info'}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Distribuição por plano"
              data={query.data.byPlanTier.map((row) => ({ label: TENANT_PLAN_TIER_LABELS[row.tier], value: row.count }))}
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhuma transportadora cadastrada."
            />
            <div className="rounded-lg border border-border bg-white p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                <Clock size={16} className="text-ink-subtle" />
                Atividade recente (últimos 30 dias)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Viagens concluídas" value={formatNumber(query.data.tripsCompletedLast30Days)} />
                <StatCard label="Checklists concluídos" value={formatNumber(query.data.checklistsCompletedLast30Days)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
