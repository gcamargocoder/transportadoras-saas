'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ErrorState } from '../../../../components/ui/error-state';
import { FormField } from '../../../../components/ui/form-field';
import { Input } from '../../../../components/ui/input';
import { LoadingState } from '../../../../components/ui/loading-state';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { Tabs } from '../../../../components/ui/tabs';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { MAINTENANCE_STATUS_TONE } from '../../../../features/fleet/status';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import {
  approveMaintenance,
  cancelMaintenance,
  completeMaintenance,
  diagnoseMaintenance,
  getMaintenance,
  getMaintenanceHistory,
  startMaintenance,
  submitMaintenanceForApproval,
} from '../../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import {
  MAINTENANCE_COMPONENT_LABELS,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TYPE_LABELS,
  TIRE_LOCATION_LABELS,
} from '../../../../lib/labels';
import type { VehicleMaintenanceStatus } from '../../../../types/enums';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../../../utils/format';

type TabValue = 'overview' | 'history';

// Fase 82 -- guards de UX que espelham assertWorkOrderActionAllowed
// (apps/api/src/fleet/utils/maintenance-status-transition.util.ts): o backend
// continua sendo a autoridade (409 se a acao nao for valida), aqui e so para
// nao oferecer um botao que sempre falharia.
const CAN_DIAGNOSE: VehicleMaintenanceStatus[] = ['OPEN'];
const CAN_SUBMIT: VehicleMaintenanceStatus[] = ['OPEN', 'DIAGNOSING'];
const CAN_APPROVE: VehicleMaintenanceStatus[] = ['AWAITING_APPROVAL'];
const CAN_START: VehicleMaintenanceStatus[] = ['OPEN', 'DIAGNOSING', 'APPROVED', 'WAITING_PARTS'];
const TERMINAL: VehicleMaintenanceStatus[] = ['COMPLETED', 'CANCELLED'];

export default function MaintenanceDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);
  const [tab, setTab] = useState<TabValue>('overview');

  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  const [diagnosisText, setDiagnosisText] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeDate, setCompleteDate] = useState('');
  const [completeOdometer, setCompleteOdometer] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const query = useQuery({
    queryKey: ['maintenances', id],
    queryFn: () => getMaintenance(id),
  });

  const historyQuery = useQuery({
    queryKey: ['maintenances', id, 'history'],
    queryFn: () => getMaintenanceHistory(id, { pageSize: 50 }),
    enabled: tab === 'history',
  });

  function invalidate(): void {
    queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  }

  const diagnoseMutation = useMutation({
    mutationFn: () => diagnoseMaintenance(id, diagnosisText),
    onSuccess: () => {
      toast.success('Diagnóstico iniciado.');
      setDiagnoseOpen(false);
      setDiagnosisText('');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível iniciar o diagnóstico.', toFriendlyMessage(error)),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitMaintenanceForApproval(id),
    onSuccess: () => {
      toast.success('OS enviada para aprovação.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível enviar para aprovação.', toFriendlyMessage(error)),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveMaintenance(id),
    onSuccess: () => {
      toast.success('OS aprovada.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível aprovar a OS.', toFriendlyMessage(error)),
  });

  const startMutation = useMutation({
    mutationFn: () => startMaintenance(id),
    onSuccess: () => {
      toast.success('Execução iniciada.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível iniciar a execução.', toFriendlyMessage(error)),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      completeMaintenance(id, completeDate, completeOdometer ? Number(completeOdometer) : undefined),
    onSuccess: () => {
      toast.success('OS concluída.');
      setCompleteOpen(false);
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível concluir a OS.', toFriendlyMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelMaintenance(id),
    onSuccess: () => {
      toast.success('OS cancelada.');
      setCancelOpen(false);
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível cancelar a OS.', toFriendlyMessage(error)),
  });

  if (query.isLoading) return <LoadingState label="Carregando ordem de serviço" />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const m = query.data;
  const canDiagnose = canWrite && CAN_DIAGNOSE.includes(m.status);
  const canSubmit = canWrite && CAN_SUBMIT.includes(m.status);
  const canApprove = canWrite && CAN_APPROVE.includes(m.status);
  const canStart = canWrite && CAN_START.includes(m.status);
  const canClose = canWrite && !TERMINAL.includes(m.status);

  return (
    <div>
      <PageHeader
        title={m.serviceOrderNumber ?? `OS ${m.id.slice(0, 8)}`}
        description={m.vehiclePlate ? `Veículo ${m.vehiclePlate}` : undefined}
        breadcrumb={[{ label: 'Manutenções', href: '/maintenances' }, { label: m.serviceOrderNumber ?? m.id.slice(0, 8) }]}
        actions={
          <>
            <Badge tone={m.priority === 'CRITICAL' ? 'danger' : 'neutral'}>{MAINTENANCE_PRIORITY_LABELS[m.priority]}</Badge>
            <Badge tone={MAINTENANCE_STATUS_TONE[m.status]}>{MAINTENANCE_STATUS_LABELS[m.status]}</Badge>
          </>
        }
      />

      {(canDiagnose || canSubmit || canApprove || canStart || canClose) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {canDiagnose && (
            <Button size="sm" onClick={() => setDiagnoseOpen(true)}>
              Iniciar diagnóstico
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" variant="outline" loading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              Enviar para aprovação
            </Button>
          )}
          {canApprove && (
            <Button size="sm" loading={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
              Aprovar
            </Button>
          )}
          {canStart && (
            <Button size="sm" loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
              Iniciar execução
            </Button>
          )}
          {canClose && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCompleteDate(new Date().toISOString().slice(0, 10));
                setCompleteOdometer(m.odometerKm !== null ? String(m.odometerKm) : '');
                setCompleteOpen(true);
              }}
            >
              Concluir
            </Button>
          )}
          {canClose && (
            <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
              Cancelar
            </Button>
          )}
        </div>
      )}

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'history', label: 'Histórico' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Identificação" />
              <CardBody>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tipo" value={MAINTENANCE_TYPE_LABELS[m.type]} />
                  <Field label="Componente" value={m.component ? MAINTENANCE_COMPONENT_LABELS[m.component] : '—'} />
                  <Field label="Veículo" value={m.vehiclePlate ?? '—'} link={m.vehiclePlate ? `/vehicles/${m.vehicleId}` : undefined} router={router} />
                  <Field label="Nº OS" value={m.serviceOrderNumber ?? '—'} />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Datas e quilometragem" />
              <CardBody>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Abertura" value={formatDate(m.openedAt)} />
                  <Field label="Previsão" value={m.scheduledAt ? formatDate(m.scheduledAt) : '—'} />
                  <Field label="Início da execução" value={m.startedAt ? formatDateTime(m.startedAt) : '—'} />
                  <Field label="Conclusão" value={m.completedAt ? formatDate(m.completedAt) : '—'} />
                  <Field label="Km na abertura" value={m.odometerKm !== null ? `${formatNumber(m.odometerKm)} km` : '—'} />
                  <Field label="Km na conclusão" value={m.completionOdometerKm !== null ? `${formatNumber(m.completionOdometerKm)} km` : '—'} />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Problema e diagnóstico" />
              <CardBody>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs text-ink-subtle">Problema relatado</p>
                    <p className="mt-0.5 text-sm text-ink">{m.description ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-subtle">Diagnóstico técnico</p>
                    <p className="mt-0.5 text-sm text-ink">{m.diagnosis ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-subtle">Observações</p>
                    <p className="mt-0.5 text-sm text-ink">{m.notes ?? '—'}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Execução" />
              <CardBody>
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Oficina"
                    value={m.workshopName ?? m.workshop ?? '—'}
                    link={m.workshopId ? `/workshops/${m.workshopId}` : undefined}
                    router={router}
                  />
                  <Field
                    label="Fornecedor"
                    value={m.supplierName ?? m.supplier ?? '—'}
                    link={m.supplierId ? `/suppliers/${m.supplierId}` : undefined}
                    router={router}
                  />
                  <Field label="Mecânico" value={m.mechanic ?? '—'} />
                  <Field label="Nota fiscal" value={m.invoiceNumber ?? '—'} />
                </div>
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Custos" description="Mão de obra, peças e total (calculado automaticamente)." />
              <CardBody>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Mão de obra" value={m.laborCost !== null ? formatCurrency(m.laborCost) : '—'} />
                  <Field label="Peças" value={m.partsCost !== null ? formatCurrency(m.partsCost) : '—'} />
                  <Field label="Total" value={m.totalCost !== null ? formatCurrency(m.totalCost) : '—'} />
                </div>
                {m.parts.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                    {m.parts.map((part) => (
                      <li key={part.id} className="flex items-center justify-between text-sm">
                        <span className="text-ink">
                          {part.name} × {part.quantity}
                        </span>
                        <span className="text-ink-subtle">{formatCurrency(part.totalPrice)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {m.tireMovements.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Pneus"
                  description="Trocas/movimentações de pneu vinculadas a esta OS."
                />
                <CardBody>
                  <ul className="flex flex-col gap-2">
                    {m.tireMovements.map((movement) => (
                      <li key={movement.id} className="flex items-center justify-between text-sm">
                        <button
                          type="button"
                          className="text-brand-600 hover:underline"
                          onClick={() => router.push(`/tires/${movement.tireId}`)}
                        >
                          {movement.tireFireNumber}
                        </button>
                        <span className="text-ink-subtle">
                          {movement.previousPosition ?? '—'} → {movement.newPosition ?? TIRE_LOCATION_LABELS[movement.newLocationType]}
                        </span>
                        <span className="text-ink-subtle">{formatDateTime(movement.movementDate)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            {historyQuery.isLoading && <LoadingState label="Carregando histórico" />}
            {historyQuery.data && historyQuery.data.items.length === 0 && (
              <EmptyState title="Nenhum evento de auditoria registrado" />
            )}
            {historyQuery.data && historyQuery.data.items.length > 0 && (
              <ul className="divide-y divide-border">
                {historyQuery.data.items.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="font-medium text-ink">{entry.action}</span>
                    <span className="text-ink-subtle">{formatDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Modal
        open={diagnoseOpen}
        onClose={() => setDiagnoseOpen(false)}
        title="Iniciar diagnóstico"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDiagnoseOpen(false)} disabled={diagnoseMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => diagnoseMutation.mutate()}
              loading={diagnoseMutation.isPending}
              disabled={diagnosisText.trim().length === 0}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <FormField label="Diagnóstico técnico" htmlFor="diagnosis" required>
          <textarea
            id="diagnosis"
            className="min-h-[100px] w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-ink"
            value={diagnosisText}
            onChange={(e) => setDiagnosisText(e.target.value)}
            maxLength={2000}
          />
        </FormField>
      </Modal>

      <Modal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Concluir OS"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={completeMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => completeMutation.mutate()} loading={completeMutation.isPending} disabled={!completeDate}>
              Concluir
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label="Data de conclusão" htmlFor="completedAt" required>
            <Input id="completedAt" type="date" value={completeDate} onChange={(e) => setCompleteDate(e.target.value)} />
          </FormField>
          <FormField label="Quilometragem na conclusão" htmlFor="completionOdometerKm">
            <Input
              id="completionOdometerKm"
              type="number"
              value={completeOdometer}
              onChange={(e) => setCompleteOdometer(e.target.value)}
            />
          </FormField>
          <p className="text-xs text-ink-subtle">
            É necessário que a OS já tenha custo de mão de obra e/ou peças informado (edite antes, se preciso).
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancelar OS"
        description="Esta OS será marcada como cancelada e não poderá mais ser alterada. Deseja continuar?"
        confirmLabel="Cancelar OS"
        danger
        loading={cancelMutation.isPending}
      />
    </div>
  );
}

function Field({
  label,
  value,
  link,
  router,
}: {
  label: string;
  value: string;
  link?: string | undefined;
  router?: { push: (href: string) => void } | undefined;
}): JSX.Element {
  return (
    <div>
      <p className="text-xs text-ink-subtle">{label}</p>
      {link && router ? (
        <button
          type="button"
          className="mt-0.5 text-sm font-medium text-brand-700 hover:underline"
          onClick={() => router.push(link)}
        >
          {value}
        </button>
      ) : (
        <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
      )}
    </div>
  );
}
