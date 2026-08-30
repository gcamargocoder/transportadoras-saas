'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { CHECKLIST_STATUS_LABELS, CHECKLIST_STATUS_TONE, CHECKLIST_TYPE_LABELS } from '../../../../features/checklists/status';
import { CreateMaintenanceModal } from '../../../../features/fleet/create-maintenance-modal';
import { MAINTENANCE_STATUS_TONE } from '../../../../features/fleet/status';
import { getChecklistExecution } from '../../../../lib/api/checklist.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { useAuth } from '../../../../hooks/use-auth';
import { MAINTENANCE_STATUS_LABELS } from '../../../../lib/labels';
import type { ChecklistAnswerEntity } from '../../../../types/entities';
import { formatDateTime } from '../../../../utils/format';

// Fase 111 -- primeira tela administrativa do modulo de checklist (Fase 38/39
// so entregaram os contratos de API, "sem tela nesta fase" -- ver
// docs/checklist-module.md). So leitura + acao "Abrir OS" quando ha
// nao-conformidade critica; criacao/edicao de TEMPLATE continua fora de
// escopo (autoria de formulario e uma frente separada, nao o consolidamento
// operacional pedido nesta fase).
export default function ChecklistExecutionDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);
  const [openMaintenanceModal, setOpenMaintenanceModal] = useState(false);

  const query = useQuery({
    queryKey: ['checklists', 'executions', id],
    queryFn: () => getChecklistExecution(id),
  });

  if (query.isLoading) return <LoadingState label="Carregando checklist" />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const execution = query.data;
  const canOpenMaintenance = canWrite && execution.hasCriticalNonConformity && execution.vehicleId !== null;

  return (
    <div>
      <PageHeader
        title={execution.templateName}
        description={CHECKLIST_TYPE_LABELS[execution.templateType]}
        breadcrumb={[{ label: 'Checklists', href: '/checklists' }, { label: execution.templateName }]}
        actions={
          <>
            <Badge tone={CHECKLIST_STATUS_TONE[execution.status]}>{CHECKLIST_STATUS_LABELS[execution.status]}</Badge>
            <Badge tone={execution.hasCriticalNonConformity ? 'danger' : 'success'}>
              {execution.hasCriticalNonConformity ? 'Não conformidade crítica' : 'Sem não conformidade crítica'}
            </Badge>
          </>
        }
      />

      {canOpenMaintenance && (
        <div className="mb-4">
          <Button size="sm" variant="danger" onClick={() => setOpenMaintenanceModal(true)}>
            Abrir OS a partir desta não conformidade
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Identificação" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Veículo" value={execution.vehiclePlate ?? '—'} link={execution.vehicleId ? `/vehicles/${execution.vehicleId}` : undefined} router={router} />
              <Field label="Motorista" value={execution.driverName ?? '—'} />
              <Field
                label="Viagem"
                value={execution.tripDestinationName ?? '—'}
                link={execution.tripId ? `/trips/${execution.tripId}` : undefined}
                router={router}
              />
              <Field label="Versão do template" value={String(execution.templateVersion)} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Registro" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Início" value={formatDateTime(execution.startedAt)} />
              <Field label="Conclusão" value={execution.completedAt ? formatDateTime(execution.completedAt) : '—'} />
              <Field label="Local" value={execution.inspectionLocation ?? execution.address ?? '—'} />
              <Field label="Responsável" value={execution.responsibleName ?? '—'} />
              <Field label="Km informado" value={execution.odometerKm !== null ? `${execution.odometerKm} km` : '—'} />
              <Field label="Evidências enviadas" value={String(execution.evidence.length)} />
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Respostas" description="Itens críticos destacados; evidências obrigatórias indicadas." />
          <CardBody>
            <ul className="flex flex-col divide-y divide-border">
              {execution.answers.map((answer) => (
                <AnswerRow key={answer.id} answer={answer} />
              ))}
              {execution.answers.length === 0 && <p className="py-3 text-sm text-ink-subtle">Nenhuma resposta registrada ainda.</p>}
            </ul>
          </CardBody>
        </Card>

        {execution.maintenances.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader title="Ordens de serviço" description="OS abertas a partir deste checklist." />
            <CardBody>
              <ul className="flex flex-col gap-2">
                {execution.maintenances.map((maintenance) => (
                  <li key={maintenance.id} className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      className="text-brand-600 hover:underline"
                      onClick={() => router.push(`/maintenances/${maintenance.id}`)}
                    >
                      {maintenance.serviceOrderNumber ?? maintenance.id.slice(0, 8)}
                    </button>
                    <Badge tone={MAINTENANCE_STATUS_TONE[maintenance.status]}>{MAINTENANCE_STATUS_LABELS[maintenance.status]}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>

      {execution.vehicleId && (
        <CreateMaintenanceModal
          open={openMaintenanceModal}
          onClose={() => setOpenMaintenanceModal(false)}
          defaultVehicleId={execution.vehicleId}
          defaultDescription={`Não conformidade crítica identificada no checklist "${execution.templateName}" de ${formatDateTime(execution.startedAt)}.`}
          defaultPriority="HIGH"
          checklistExecutionId={execution.id}
        />
      )}
    </div>
  );
}

function AnswerRow({ answer }: { answer: ChecklistAnswerEntity }): JSX.Element {
  const value = formatAnswerValue(answer);
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{answer.itemLabel}</p>
        <p className="text-xs text-ink-subtle">{answer.itemCode}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {answer.itemCritical && <Badge tone="warning">Crítico</Badge>}
        <span className="text-sm text-ink">{value}</span>
      </div>
    </li>
  );
}

function formatAnswerValue(answer: ChecklistAnswerEntity): string {
  if (answer.booleanValue !== null) return answer.booleanValue ? 'Sim' : 'Não';
  if (answer.textValue !== null) return answer.textValue;
  if (answer.numberValue !== null) return String(answer.numberValue);
  if (answer.selectedValue !== null) return answer.selectedValue;
  return '—';
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
        <button type="button" className="mt-0.5 text-sm font-medium text-brand-700 hover:underline" onClick={() => router.push(link)}>
          {value}
        </button>
      ) : (
        <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
      )}
    </div>
  );
}
