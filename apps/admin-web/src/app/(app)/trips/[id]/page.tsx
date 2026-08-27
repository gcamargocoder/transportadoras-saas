'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { Tabs } from '../../../../components/ui/tabs';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { cancelTrip, getTrip } from '../../../../lib/api/trips.api';
import { TRIP_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { TRIP_STATUS_TONE } from '../../../../features/trips/status';
import { UpdateTripPlanModal } from '../../../../features/trips/update-trip-plan-modal';
import { AdvancesTab } from '../../../../features/trips/tabs/advances-tab';
import { DeliveryStopsTab } from '../../../../features/trips/tabs/delivery-stops-tab';
import { ExpensesTab } from '../../../../features/trips/tabs/expenses-tab';
import { FinancialTab } from '../../../../features/trips/tabs/financial-tab';
import { FiscalTab } from '../../../../features/trips/tabs/fiscal-tab';
import { FleetOptimizationTab } from '../../../../features/trips/tabs/fleet-optimization-tab';
import { FreightTab } from '../../../../features/trips/tabs/freight-tab';
import { OccurrencesTab } from '../../../../features/trips/tabs/occurrences-tab';
import { OperacaoTab } from '../../../../features/trips/tabs/operacao-tab';
import { OverviewTab } from '../../../../features/trips/tabs/overview-tab';
import { ReconciliationTab } from '../../../../features/trips/tabs/reconciliation-tab';
import { RotaTab } from '../../../../features/trips/tabs/rota-tab';
import { RevenuesTab } from '../../../../features/trips/tabs/revenues-tab';
import { ShiftsTab } from '../../../../features/trips/tabs/shifts-tab';
import { TimelineTab } from '../../../../features/trips/tabs/timeline-tab';
import { TollsTab } from '../../../../features/trips/tabs/tolls-tab';
import { TRIP_STATUS_LABELS } from '../../../../lib/labels';

type TabValue =
  | 'overview'
  | 'timeline'
  | 'fleet-optimization'
  | 'delivery-stops'
  | 'occurrences'
  | 'shifts'
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

// Fase 87 -- so e possivel editar/cancelar o planejamento enquanto a viagem
// nao chegou a um estado terminal. Edicao completa (origem/destino/motorista/
// composicao/datas) so faz sentido em PLANNED (mesma regra ja aplicada por
// TripsService.update); cancelamento e permitido de qualquer estado nao
// terminal (mesma regra de ALLOWED_TRANSITIONS ja existente no backend --
// nunca duplicada aqui, o backend rejeita com 409 se a transicao nao for
// valida).
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

export default function TripDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const tripId = params.id;
  const [tab, setTab] = useState<TabValue>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const tripQuery = useQuery({ queryKey: ['trips', tripId], queryFn: () => getTrip(tripId) });

  const cancelMutation = useMutation({
    mutationFn: () => cancelTrip(tripId),
    onSuccess: () => {
      toast.success('Viagem cancelada.');
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setCancelOpen(false);
    },
    onError: (error) => toast.error('Não foi possível cancelar a viagem.', toFriendlyMessage(error)),
  });

  if (tripQuery.isLoading) return <LoadingState label="Carregando viagem" />;
  if (tripQuery.isError || !tripQuery.data)
    return <ErrorState onRetry={() => tripQuery.refetch()} />;

  const trip = tripQuery.data;
  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);
  const canEditPlan = canWrite && trip.status === 'PLANNED';
  const canCancel = canWrite && !TERMINAL_STATUSES.includes(trip.status);
  // Fase 88 -- paradas/entregas planejadas so podem ser adicionadas/editadas/
  // removidas/reordenadas enquanto a viagem ainda nao partiu de fato (mesmo
  // criterio de TripDeliveryStopsService.assertPlanningAllowed no backend);
  // o status de progresso de cada parada continua editavel ate a viagem
  // chegar a um estado terminal.
  const planningAllowed = trip.status !== 'CANCELLED' && !trip.actualDeparture;
  const tripFinished = TERMINAL_STATUSES.includes(trip.status);

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
          <>
            <Badge tone={TRIP_STATUS_TONE[trip.status]}>{TRIP_STATUS_LABELS[trip.status]}</Badge>
            {canEditPlan && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Editar planejamento
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                <Ban size={14} className="text-danger-600" />
                Cancelar viagem
              </Button>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'timeline', label: 'Linha do tempo' },
          { value: 'fleet-optimization', label: 'Otimização de frota' },
          { value: 'delivery-stops', label: 'Paradas/Entregas' },
          { value: 'occurrences', label: 'Ocorrências' },
          { value: 'shifts', label: 'Jornada' },
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
        {tab === 'fleet-optimization' && <FleetOptimizationTab tripId={trip.id} canApply={canEditPlan} />}
        {tab === 'delivery-stops' && (
          <DeliveryStopsTab tripId={trip.id} planningAllowed={planningAllowed} tripFinished={tripFinished} />
        )}
        {tab === 'occurrences' && <OccurrencesTab tripId={trip.id} />}
        {tab === 'shifts' && <ShiftsTab tripId={trip.id} />}
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

      {canEditPlan && (
        <UpdateTripPlanModal open={editOpen} onClose={() => setEditOpen(false)} trip={trip} />
      )}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancelar viagem"
        description="Tem certeza que deseja cancelar esta viagem? Esta ação não pode ser desfeita."
        confirmLabel="Cancelar viagem"
        danger
        loading={cancelMutation.isPending}
      />
    </div>
  );
}
