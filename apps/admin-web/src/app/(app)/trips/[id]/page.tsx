'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { Tabs } from '../../../../components/ui/tabs';
import { getTrip } from '../../../../lib/api/trips.api';
import { TRIP_STATUS_TONE } from '../../../../features/trips/status';
import { AdvancesTab } from '../../../../features/trips/tabs/advances-tab';
import { ExpensesTab } from '../../../../features/trips/tabs/expenses-tab';
import { FinancialTab } from '../../../../features/trips/tabs/financial-tab';
import { FiscalTab } from '../../../../features/trips/tabs/fiscal-tab';
import { FreightTab } from '../../../../features/trips/tabs/freight-tab';
import { OperacaoTab } from '../../../../features/trips/tabs/operacao-tab';
import { OverviewTab } from '../../../../features/trips/tabs/overview-tab';
import { ReconciliationTab } from '../../../../features/trips/tabs/reconciliation-tab';
import { RotaTab } from '../../../../features/trips/tabs/rota-tab';
import { RevenuesTab } from '../../../../features/trips/tabs/revenues-tab';
import { TimelineTab } from '../../../../features/trips/tabs/timeline-tab';
import { TollsTab } from '../../../../features/trips/tabs/tolls-tab';
import { TRIP_STATUS_LABELS } from '../../../../lib/labels';

type TabValue =
  | 'overview'
  | 'timeline'
  | 'rota'
  | 'operacao'
  | 'tolls'
  | 'reconciliation'
  | 'expenses'
  | 'revenues'
  | 'advances'
  | 'financial'
  | 'fiscal'
  | 'freight';

export default function TripDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const tripId = params.id;
  const [tab, setTab] = useState<TabValue>('overview');

  const tripQuery = useQuery({ queryKey: ['trips', tripId], queryFn: () => getTrip(tripId) });

  if (tripQuery.isLoading) return <LoadingState label="Carregando viagem" />;
  if (tripQuery.isError || !tripQuery.data)
    return <ErrorState onRetry={() => tripQuery.refetch()} />;

  const trip = tripQuery.data;

  return (
    <div>
      <PageHeader
        title={`${trip.originName} → ${trip.destinationName}`}
        description={trip.customerName ?? undefined}
        breadcrumb={[
          { label: 'Viagens', href: '/trips' },
          { label: `${trip.originName} → ${trip.destinationName}` },
        ]}
        actions={
          <Badge tone={TRIP_STATUS_TONE[trip.status]}>{TRIP_STATUS_LABELS[trip.status]}</Badge>
        }
      />

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'timeline', label: 'Linha do tempo' },
          { value: 'rota', label: 'Rota planejada' },
          { value: 'operacao', label: 'Operação' },
          { value: 'tolls', label: 'Pedágios' },
          { value: 'reconciliation', label: 'Conciliação de Pedágios' },
          { value: 'expenses', label: 'Despesas' },
          { value: 'revenues', label: 'Receitas' },
          { value: 'advances', label: 'Adiantamentos' },
          { value: 'financial', label: 'Financeiro' },
          { value: 'fiscal', label: 'Documentos fiscais' },
          { value: 'freight', label: 'Comercial' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        {tab === 'overview' && <OverviewTab trip={trip} />}
        {tab === 'timeline' && <TimelineTab tripId={trip.id} />}
        {tab === 'rota' && <RotaTab tripId={trip.id} />}
        {tab === 'operacao' && <OperacaoTab tripId={trip.id} />}
        {tab === 'tolls' && <TollsTab tripId={trip.id} />}
        {tab === 'reconciliation' && <ReconciliationTab tripId={trip.id} />}
        {tab === 'expenses' && <ExpensesTab tripId={trip.id} />}
        {tab === 'revenues' && <RevenuesTab tripId={trip.id} />}
        {tab === 'advances' && <AdvancesTab tripId={trip.id} />}
        {tab === 'financial' && <FinancialTab tripId={trip.id} />}
        {tab === 'fiscal' && <FiscalTab tripId={trip.id} />}
        {tab === 'freight' && <FreightTab tripId={trip.id} />}
      </div>
    </div>
  );
}
