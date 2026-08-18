'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Pencil, Truck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { CardBody, CardHeader } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { Tabs } from '../../../../components/ui/tabs';
import { useToast } from '../../../../components/ui/toast';
import { AssignVehicleModal } from '../../../../features/drivers/assign-vehicle-modal';
import { CreateDriverModal } from '../../../../features/drivers/create-driver-modal';
import { useAuth } from '../../../../hooks/use-auth';
import {
  endDriverVehicleAssignment,
  getDriver,
  getDriverDocuments,
  getDriverVehicleAssignments,
  updateDriverStatus,
} from '../../../../lib/api/drivers.api';
import { listFiscalDocuments } from '../../../../lib/api/fiscal.api';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { listTrips } from '../../../../lib/api/trips.api';
import { DRIVER_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import {
  DOCUMENT_TYPE_LABELS,
  DRIVER_STATUS_LABELS,
  DRIVER_STATUS_TONE,
  DRIVER_TYPE_LABELS,
  DRIVER_TYPE_TONE,
  FISCAL_DOCUMENT_TYPE_LABELS,
} from '../../../../lib/labels';
import { TRIP_STATUS_LABELS } from '../../../../lib/labels';
import { TRIP_STATUS_TONE } from '../../../../features/trips/status';
import { DriverStatus } from '../../../../types/enums';
import { formatDate, formatDateTime } from '../../../../utils/format';

const RECENT_TRIPS_LIMIT = 10;

type TabValue = 'overview' | 'vehicles' | 'trips' | 'documents';

export default function DriverDetailPage(): JSX.Element {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const driverId = params.id;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<TabValue>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const driverQuery = useQuery({
    queryKey: ['drivers', driverId],
    queryFn: () => getDriver(driverId),
  });
  const documentsQuery = useQuery({
    queryKey: ['drivers', driverId, 'documents'],
    queryFn: () => getDriverDocuments(driverId),
    enabled: tab === 'documents',
  });
  const fiscalDocumentsQuery = useQuery({
    queryKey: ['drivers', driverId, 'fiscal-documents'],
    queryFn: () => listFiscalDocuments({ driverId, pageSize: 10 }),
    enabled: tab === 'documents',
  });
  const vehicleAssignmentsQuery = useQuery({
    queryKey: ['drivers', driverId, 'vehicle-assignments'],
    queryFn: () => getDriverVehicleAssignments(driverId),
    enabled: tab === 'vehicles',
  });
  const tripsQuery = useQuery({
    queryKey: ['trips', { driverId, pageSize: RECENT_TRIPS_LIMIT }],
    queryFn: () => listTrips({ driverId, pageSize: RECENT_TRIPS_LIMIT, sortBy: 'createdAt', sortOrder: 'desc' }),
    enabled: tab === 'trips',
  });

  const statusMutation = useMutation({
    mutationFn: (status: DriverStatus) => updateDriverStatus(driverId, status),
    onSuccess: () => {
      toast.success('Status do motorista atualizado.');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const endAssignmentMutation = useMutation({
    mutationFn: () => endDriverVehicleAssignment(driverId),
    onSuccess: () => {
      toast.success('Vínculo com o veículo encerrado.');
      queryClient.invalidateQueries({ queryKey: ['drivers', driverId] });
    },
    onError: (error) => toast.error('Não foi possível encerrar o vínculo.', toFriendlyMessage(error)),
  });

  if (driverQuery.isLoading) return <LoadingState label="Carregando motorista" />;
  if (driverQuery.isError || !driverQuery.data)
    return <ErrorState onRetry={() => driverQuery.refetch()} />;

  const driver = driverQuery.data;
  const canWrite = hasRole(user?.role, DRIVER_WRITE_ROLES);

  return (
    <div>
      <PageHeader
        title={driver.name}
        description={`CNH ${driver.cnhNumber} · Categoria ${driver.cnhCategory}`}
        breadcrumb={[{ label: 'Motoristas', href: '/drivers' }, { label: driver.name }]}
        actions={
          <>
            <Badge tone={DRIVER_TYPE_TONE[driver.type]}>{DRIVER_TYPE_LABELS[driver.type]}</Badge>
            <Badge tone={DRIVER_STATUS_TONE[driver.status]}>{DRIVER_STATUS_LABELS[driver.status]}</Badge>
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Editar
              </Button>
            )}
          </>
        }
      />

      {canWrite && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={driver.status === 'ACTIVE' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('ACTIVE')}
          >
            <CheckCircle2 size={14} />
            Ativar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={driver.status === 'SUSPENDED' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('SUSPENDED')}
          >
            <Ban size={14} />
            Suspender
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={driver.status === 'INACTIVE' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('INACTIVE')}
          >
            Desativar
          </Button>
        </div>
      )}

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'vehicles', label: 'Veículos' },
          { value: 'trips', label: 'Viagens recentes' },
          { value: 'documents', label: 'Documentos' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        {tab === 'overview' && (
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="CPF" value={driver.cpf} />
              <Field label="Telefone" value={driver.phone ?? '-'} />
              <Field label="E-mail" value={driver.email ?? '-'} />
              <Field label="Vencimento CNH" value={formatDate(driver.cnhExpiresAt)} />
              <Field label="Cidade/UF" value={driver.city ? `${driver.city}/${driver.state ?? ''}` : '-'} />
              <Field label="Admissão" value={formatDate(driver.admissionDate)} />
              <Field label="Disponibilidade" value={driver.isAvailable ? 'Disponível' : 'Indisponível'} />
              <Field label="Veículo atual" value={driver.currentVehiclePlate ?? '-'} />
            </div>
            {driver.notes && (
              <div className="mt-4">
                <p className="text-xs text-ink-subtle">Observações</p>
                <p className="mt-0.5 text-sm text-ink">{driver.notes}</p>
              </div>
            )}
          </CardBody>
        )}

        {tab === 'vehicles' && (
          <div>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">Veículo atual e histórico</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {driver.currentVehiclePlate ? `Atual: ${driver.currentVehiclePlate}` : 'Nenhum veículo vinculado no momento.'}
                </p>
              </div>
              {canWrite && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                    <Truck size={14} />
                    {driver.currentVehicleId ? 'Trocar veículo' : 'Vincular veículo'}
                  </Button>
                  {driver.currentVehicleId && (
                    <Button size="sm" variant="outline" onClick={() => endAssignmentMutation.mutate()} loading={endAssignmentMutation.isPending}>
                      Encerrar vínculo
                    </Button>
                  )}
                </div>
              )}
            </div>
            {vehicleAssignmentsQuery.isLoading && <LoadingState label="Carregando histórico" />}
            {vehicleAssignmentsQuery.data && vehicleAssignmentsQuery.data.length === 0 && (
              <EmptyState title="Nenhum veículo vinculado ainda" />
            )}
            {vehicleAssignmentsQuery.data && vehicleAssignmentsQuery.data.length > 0 && (
              <ul className="divide-y divide-border">
                {vehicleAssignmentsQuery.data.map((assignment) => (
                  <li key={assignment.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="min-w-0 truncate">
                      {assignment.vehiclePlate ?? '—'}
                      {assignment.notes ? ` · ${assignment.notes}` : ''}
                    </span>
                    <span className="shrink-0 text-xs text-ink-subtle">
                      {formatDate(assignment.startedAt)} — {assignment.endedAt ? formatDate(assignment.endedAt) : 'atual'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'trips' && (
          <div>
            {tripsQuery.isLoading && <LoadingState label="Carregando viagens" />}
            {tripsQuery.data && tripsQuery.data.items.length === 0 && (
              <EmptyState title="Nenhuma viagem registrada para este motorista" />
            )}
            {tripsQuery.data && tripsQuery.data.items.length > 0 && (
              <ul className="divide-y divide-border">
                {tripsQuery.data.items.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <a href={`/trips/${t.id}`} className="min-w-0 truncate text-brand-700 hover:underline">
                      {t.originName} → {t.destinationName}
                    </a>
                    <Badge tone={TRIP_STATUS_TONE[t.status]}>{TRIP_STATUS_LABELS[t.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="flex flex-col gap-6 p-5">
            <div>
              <CardHeader title="Documentos" description="Documentos cadastrados do motorista (CNH, exame médico, MOPP, ANTT, outros)." className="px-0" />
              {documentsQuery.isLoading && <LoadingState label="Carregando documentos" />}
              {documentsQuery.data && documentsQuery.data.length === 0 && (
                <EmptyState title="Nenhum documento cadastrado" />
              )}
              {documentsQuery.data && documentsQuery.data.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {documentsQuery.data.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-ink">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                      <span className="text-ink-muted">{doc.number ?? '-'}</span>
                      <span className="text-ink-subtle">Vence em {formatDate(doc.expiresAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <CardHeader title="Documentos fiscais relacionados" description="CT-e, MDF-e, comprovantes de entrega e outros vinculados a este motorista." className="px-0" />
              {fiscalDocumentsQuery.data && fiscalDocumentsQuery.data.items.length === 0 && (
                <EmptyState title="Nenhum documento fiscal vinculado" />
              )}
              {fiscalDocumentsQuery.data && fiscalDocumentsQuery.data.items.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {fiscalDocumentsQuery.data.items.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-ink">{FISCAL_DOCUMENT_TYPE_LABELS[doc.documentType]}</span>
                      <span className="text-ink-muted">{doc.documentNumber ?? doc.fileName ?? '-'}</span>
                      <span className="text-ink-subtle">{doc.issueDate ? formatDateTime(doc.issueDate) : '-'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <CreateDriverModal open={editOpen} onClose={() => setEditOpen(false)} driver={driver} />
      <AssignVehicleModal open={assignOpen} onClose={() => setAssignOpen(false)} driverId={driverId} />
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
