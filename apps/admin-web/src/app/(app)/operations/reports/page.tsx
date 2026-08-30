'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  Building2,
  Fuel,
  PackageCheck,
  Route as RouteIcon,
  ShieldAlert,
  Truck,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card, CardHeader } from '../../../../components/ui/card';
import { DatePicker } from '../../../../components/ui/date-picker';
import { FilterBar } from '../../../../components/ui/filter-bar';
import { FormField } from '../../../../components/ui/form-field';
import { PageHeader } from '../../../../components/ui/page-header';
import { StatCard } from '../../../../components/ui/stat-card';
import { getBillingDashboard } from '../../../../lib/api/billing-operational.api';
import { getFleetOperationsDashboard, getFleetOperationsFuel, getFleetOperationsOccurrences } from '../../../../lib/api/fleet-operations.api';
import { getDeliveryOccurrencesDashboard, getDeliveryStopsDashboard } from '../../../../lib/api/trips.api';
import { formatCurrency, formatNumber } from '../../../../utils/format';

// Fase 104 -- area central de Relatorios Operacionais. Auditoria previa
// confirmou que TODOS os relatorios pedidos ja existem, espalhados em
// paginas dedicadas (Fases 29/38/41/43/45/56/59/60/68/72/91/92/97/99/101):
// esta pagina NUNCA recalcula nada -- e uma composicao de indicadores
// já prontos (mesmas chamadas de dashboard ja usadas por
// /operations/fleet, /customers/:id etc.), com link direto para o
// relatorio completo (filtros/paginacao/graficos) de cada frente. Nenhuma
// fonte de verdade nova, nenhum calculo duplicado.
function nullableCurrency(value: number | null): string {
  return value === null ? '—' : formatCurrency(value);
}

interface ReportCategoryProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  linkLabel?: string;
  isLoading?: boolean;
  isError?: boolean;
  children: React.ReactNode;
}

function ReportCategoryCard({ icon: Icon, title, description, href, linkLabel, isLoading, isError, children }: ReportCategoryProps): JSX.Element {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon size={16} className="text-ink-subtle" />
            {title}
          </span>
        }
        description={description}
        action={
          <Link href={href} className="text-xs font-medium text-brand-600 hover:underline">
            {linkLabel ?? 'Ver relatório completo →'}
          </Link>
        }
      />
      <div className="p-5">
        {isLoading && <p className="text-sm text-ink-subtle">Carregando…</p>}
        {isError && <p className="text-sm text-ink-subtle">Indicadores indisponíveis no momento.</p>}
        {!isLoading && !isError && children}
      </div>
    </Card>
  );
}

export default function OperationalReportsPage(): JSX.Element {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const hasActiveFilters = Boolean(startDate || endDate);

  // Cada query abaixo reaproveita INTEGRALMENTE um endpoint de dashboard ja
  // existente e ja testado (N+1/RBAC/multi-tenant) em sua propria fase --
  // esta pagina so os compoe visualmente, nunca duplica a agregacao.
  const fleetQuery = useQuery({
    queryKey: ['reports', 'fleet-dashboard', { startDate, endDate }],
    queryFn: ({ signal }) => getFleetOperationsDashboard({ startDate: startDate || undefined, endDate: endDate || undefined }, signal),
  });

  const fuelQuery = useQuery({
    queryKey: ['reports', 'fleet-fuel', { startDate, endDate }],
    queryFn: ({ signal }) => getFleetOperationsFuel({ startDate: startDate || undefined, endDate: endDate || undefined }, signal),
  });

  const occurrencesQuery = useQuery({
    queryKey: ['reports', 'fleet-occurrences', { startDate, endDate }],
    queryFn: ({ signal }) => getFleetOperationsOccurrences({ from: startDate || undefined, to: endDate || undefined }, signal),
  });

  const deliveriesQuery = useQuery({
    queryKey: ['reports', 'delivery-stops-dashboard', { startDate, endDate }],
    queryFn: ({ signal }) => getDeliveryStopsDashboard({ plannedFrom: startDate || undefined, plannedTo: endDate || undefined }, signal),
  });

  const deliveryOccurrencesQuery = useQuery({
    queryKey: ['reports', 'delivery-occurrences-dashboard', { startDate, endDate }],
    queryFn: ({ signal }) =>
      getDeliveryOccurrencesDashboard({ occurredFrom: startDate || undefined, occurredTo: endDate || undefined }, signal),
  });

  const billingQuery = useQuery({
    queryKey: ['reports', 'billing-dashboard', { startDate, endDate }],
    queryFn: ({ signal }) => getBillingDashboard({ startDate: startDate || undefined, endDate: endDate || undefined }, signal),
  });

  return (
    <div>
      <PageHeader
        title="Relatórios Operacionais"
        description="Área central de relatórios — indicadores consolidados de cada frente da operação, com acesso direto ao relatório completo (filtros, paginação e gráficos)."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setStartDate('');
          setEndDate('');
        }}
      >
        <FormField label="De" htmlFor="reports-from" className="w-full sm:w-40">
          <DatePicker id="reports-from" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="Até" htmlFor="reports-to" className="w-full sm:w-40">
          <DatePicker id="reports-to" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </FilterBar>
      <p className="-mt-2 mb-6 text-xs text-ink-subtle">
        O período aqui é aplicado aos indicadores desta página. Cada relatório completo tem seus próprios filtros
        (veículo, motorista, cliente, status e demais dimensões já suportadas).
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Viagens -- quantidade/status/duracao ja no dashboard de frota (Fase 29); origem/destino e paginacao completa em /trips. */}
        <ReportCategoryCard
          icon={RouteIcon}
          title="Viagens"
          description="Quantidade, status, duração e desempenho. Detalhe por viagem (origem/destino) na listagem completa."
          href="/trips"
          isLoading={fleetQuery.isLoading}
          isError={fleetQuery.isError}
        >
          {fleetQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Viagens ativas" value={formatNumber(fleetQuery.data.overview.activeTrips)} icon={RouteIcon} tone="info" />
              <StatCard label="Utilização da frota" value={`${formatNumber(fleetQuery.data.overview.vehiclesOnTrip)} veíc. em viagem`} />
            </div>
          )}
        </ReportCategoryCard>

        {/* Entregas -- realizadas/pendentes/atrasadas/falhas (Fase 99). */}
        <ReportCategoryCard
          icon={PackageCheck}
          title="Entregas"
          description="Realizadas, pendentes, atrasadas e falhas — paradas/entregas planejadas de todas as viagens."
          href="/operations/deliveries"
          isLoading={deliveriesQuery.isLoading}
          isError={deliveriesQuery.isError}
        >
          {deliveriesQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Concluídas" value={formatNumber(deliveriesQuery.data.completedCount)} tone="success" />
              <StatCard
                label="Atrasadas"
                value={formatNumber(deliveriesQuery.data.lateCount)}
                tone={deliveriesQuery.data.lateCount > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="Com falha"
                value={formatNumber(deliveriesQuery.data.failedCount)}
                tone={deliveriesQuery.data.failedCount > 0 ? 'danger' : 'success'}
              />
              <StatCard label="Total" value={formatNumber(deliveriesQuery.data.totalCount)} />
            </div>
          )}
        </ReportCategoryCard>

        {/* Ocorrencias -- quantidade/categorias/severidade/status/evolucao ja completos (Fase 68). */}
        <ReportCategoryCard
          icon={ShieldAlert}
          title="Ocorrências"
          description="Quantidade, categorias, severidade, status e evolução mensal — todas as ocorrências da frota."
          href="/operations/fleet/occurrences"
          isLoading={occurrencesQuery.isLoading}
          isError={occurrencesQuery.isError}
        >
          {occurrencesQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Em aberto"
                value={formatNumber(occurrencesQuery.data.openCount)}
                tone={occurrencesQuery.data.openCount > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="Críticas em aberto"
                value={formatNumber(occurrencesQuery.data.criticalOpenCount)}
                icon={AlertTriangle}
                tone={occurrencesQuery.data.criticalOpenCount > 0 ? 'danger' : 'success'}
              />
              <StatCard label="Resolvidas" value={formatNumber(occurrencesQuery.data.resolvedCount)} tone="success" />
              <StatCard label="Total" value={formatNumber(occurrencesQuery.data.totalCount)} />
            </div>
          )}
          {deliveryOccurrencesQuery.data && (
            <p className="mt-3 text-xs text-ink-subtle">
              {formatNumber(deliveryOccurrencesQuery.data.totalCount)} vinculada(s) diretamente a entregas —{' '}
              <Link href="/operations/delivery-occurrences" className="text-brand-600 hover:underline">
                ver relatório de entregas
              </Link>
              .
            </p>
          )}
        </ReportCategoryCard>

        {/* Frota -- utilizacao/disponibilidade ja completos (Fase 29/41). */}
        <ReportCategoryCard
          icon={Truck}
          title="Frota"
          description="Utilização, disponibilidade e principais indicadores operacionais dos veículos."
          href="/operations/fleet"
          isLoading={fleetQuery.isLoading}
          isError={fleetQuery.isError}
        >
          {fleetQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Ativos" value={`${formatNumber(fleetQuery.data.overview.activeVehicles)} / ${formatNumber(fleetQuery.data.overview.totalVehicles)}`} />
              <StatCard label="Disponíveis" value={formatNumber(fleetQuery.data.overview.vehiclesAvailable)} tone="success" />
              <StatCard
                label="Em manutenção"
                value={formatNumber(fleetQuery.data.overview.maintenanceVehicles)}
                tone={fleetQuery.data.overview.maintenanceVehicles > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="Suspensos"
                value={formatNumber(fleetQuery.data.overview.suspendedVehicles)}
                tone={fleetQuery.data.overview.suspendedVehicles > 0 ? 'warning' : 'success'}
              />
            </div>
          )}
        </ReportCategoryCard>

        {/* Manutencao -- OS/custos/veiculos/situacao ja completos (Fase 45). */}
        <ReportCategoryCard
          icon={Wrench}
          title="Manutenção"
          description="Ordens de serviço, custos, veículos e situação (preventivas vencidas, corretivas)."
          href="/operations/fleet/maintenance"
          isLoading={fleetQuery.isLoading}
          isError={fleetQuery.isError}
        >
          {fleetQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Custo total" value={formatCurrency(fleetQuery.data.maintenance.totalCost)} />
              <StatCard
                label="Preventivas vencidas"
                value={formatNumber(fleetQuery.data.maintenance.overdueCount)}
                tone={fleetQuery.data.maintenance.overdueCount > 0 ? 'danger' : 'success'}
              />
              <StatCard label="Corretivas" value={formatNumber(fleetQuery.data.maintenance.correctiveCount)} />
              <StatCard label="Veículo com maior custo" value={fleetQuery.data.maintenance.topVehiclesByCost[0]?.plate ?? '—'} />
            </div>
          )}
        </ReportCategoryCard>

        {/* Combustivel -- consumo/abastecimentos ja completos (Fase 41). */}
        <ReportCategoryCard
          icon={Fuel}
          title="Combustível"
          description="Consumo, abastecimentos e indicadores disponíveis (litros, custo, km/L, custo/km)."
          href="/operations/fleet/fuel"
          isLoading={fuelQuery.isLoading}
          isError={fuelQuery.isError}
        >
          {fuelQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Litros abastecidos" value={`${formatNumber(fuelQuery.data.summary.totalLiters, 1)} L`} />
              <StatCard label="Custo total" value={formatCurrency(fuelQuery.data.summary.totalCost)} />
              <StatCard
                label="Consumo médio"
                value={fuelQuery.data.consumption.available && fuelQuery.data.consumption.value !== null ? `${formatNumber(fuelQuery.data.consumption.value, 1)} km/L` : 'Indisponível'}
              />
              <StatCard
                label="Custo/km"
                value={fuelQuery.data.costPerKm.available ? nullableCurrency(fuelQuery.data.costPerKm.value) : 'Indisponível'}
              />
            </div>
          )}
        </ReportCategoryCard>

        {/* Custos operacionais -- consolidado ja existente (Fase 41), sem duplicacao financeira. */}
        <ReportCategoryCard
          icon={Wallet}
          title="Custos operacionais"
          description="Combustível + manutenção + pneus + pedágio + outras despesas aprovadas — custo já consolidado."
          href="/operations/fleet/costs"
          isLoading={fleetQuery.isLoading}
          isError={fleetQuery.isError}
        >
          {fleetQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Custo total" value={formatCurrency(fleetQuery.data.costs.totalCost)} />
              <StatCard label="Combustível" value={formatCurrency(fleetQuery.data.costs.fuelCost)} />
              <StatCard label="Manutenção" value={formatCurrency(fleetQuery.data.costs.maintenanceCost)} />
              <StatCard label="Custo médio/veículo" value={nullableCurrency(fleetQuery.data.costs.averageCostPerVehicle)} />
            </div>
          )}
        </ReportCategoryCard>

        {/* Financeiro/Faturamento -- fontes financeiras oficiais ja existentes (Fase 60/72/76/79), nenhuma nova. */}
        <ReportCategoryCard
          icon={Banknote}
          title="Faturamento"
          description="Conciliação comercial das viagens — faturável, faturado, recebido e saldo. Fonte financeira oficial (Fase 60)."
          href="/operations/fleet/billing"
          isLoading={billingQuery.isLoading}
          isError={billingQuery.isError}
        >
          {billingQuery.data && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Faturado" value={formatCurrency(billingQuery.data.totalInvoiced)} tone="success" />
              <StatCard
                label="Saldo a faturar"
                value={formatCurrency(billingQuery.data.balanceToInvoice)}
                tone={billingQuery.data.balanceToInvoice > 0 ? 'warning' : 'success'}
              />
            </div>
          )}
          <p className="mt-3 text-xs text-ink-subtle">
            Contas a receber, contas a pagar e fluxo de caixa continuam em{' '}
            <Link href="/operations/finance/receivables" className="text-brand-600 hover:underline">
              Financeiro
            </Link>
            .
          </p>
        </ReportCategoryCard>

        {/* Clientes -- viagens/entregas/ocorrencias/indicadores comerciais ja no detalhe do cliente (Fases 59/93/97/98/104). */}
        <ReportCategoryCard
          icon={Building2}
          title="Relatório por cliente"
          description="Viagens, entregas, ocorrências, faturamento e rentabilidade — selecione um cliente para ver o relatório completo."
          href="/customers"
          linkLabel="Ver clientes →"
        >
          <p className="text-sm text-ink-subtle">
            Abra o detalhe de qualquer cliente para o relatório individual completo.
          </p>
        </ReportCategoryCard>
      </div>
    </div>
  );
}
