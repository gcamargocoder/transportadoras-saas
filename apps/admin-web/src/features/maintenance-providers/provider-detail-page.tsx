'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { PageHeader } from '../../components/ui/page-header';
import { StatCard } from '../../components/ui/stat-card';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import { toFriendlyMessage } from '../../lib/api/errors';
import {
  getMaintenanceProvider,
  getMaintenanceProviderSummary,
  updateMaintenanceProviderStatus,
} from '../../lib/api/maintenance-providers.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { formatCurrency, formatDate } from '../../utils/format';
import { UpdateProviderModal } from './update-provider-modal';

// Compartilhado entre /workshops/:id e /suppliers/:id -- mesma entidade,
// mesma tela (ver provider-list-page.tsx).
export function MaintenanceProviderDetailPage({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);
  const [editOpen, setEditOpen] = useState(false);

  const query = useQuery({ queryKey: ['maintenance-providers', id], queryFn: () => getMaintenanceProvider(id) });
  const summaryQuery = useQuery({
    queryKey: ['maintenance-providers', id, 'summary'],
    queryFn: () => getMaintenanceProviderSummary(id),
  });

  const statusMutation = useMutation({
    mutationFn: (active: boolean) => updateMaintenanceProviderStatus(id, active),
    onSuccess: () => {
      toast.success('Status atualizado.');
      queryClient.invalidateQueries({ queryKey: ['maintenance-providers'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  if (query.isLoading) return <LoadingState label="Carregando cadastro" />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const provider = query.data;
  const typeLabel = provider.type === 'WORKSHOP' ? 'Oficina' : 'Fornecedor';

  return (
    <div>
      <PageHeader
        title={provider.name}
        description={provider.tradeName ?? undefined}
        breadcrumb={[{ label: backLabel, href: backHref }, { label: provider.name }]}
        actions={
          <>
            <Badge tone={provider.isActive ? 'success' : 'neutral'}>{provider.isActive ? 'Ativa' : 'Inativa'}</Badge>
            {canWrite && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil size={14} />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant={provider.isActive ? 'danger' : 'outline'}
                  onClick={() => statusMutation.mutate(!provider.isActive)}
                  loading={statusMutation.isPending}
                >
                  {provider.isActive ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                  {provider.isActive ? 'Desativar' : 'Ativar'}
                </Button>
              </>
            )}
          </>
        }
      />

      {summaryQuery.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="OS vinculadas" value={String(summaryQuery.data.osCount)} />
          <StatCard label="Veículos atendidos" value={String(summaryQuery.data.vehiclesServedCount)} />
          <StatCard
            label="Custo acumulado"
            value={summaryQuery.data.totalCost !== null ? formatCurrency(summaryQuery.data.totalCost) : '—'}
          />
          <StatCard
            label="Última utilização"
            value={summaryQuery.data.lastUsedAt ? formatDate(summaryQuery.data.lastUsedAt) : '—'}
          />
        </div>
      )}

      <Card>
        <CardHeader title={`Dados da ${typeLabel.toLowerCase()}`} />
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="CPF/CNPJ" value={provider.document ?? '—'} />
            <Field label="Telefone" value={provider.phone ?? '—'} />
            <Field label="E-mail" value={provider.email ?? '—'} />
            <Field label="Contato" value={provider.contactName ?? '—'} />
            <Field label="Especialidades" value={provider.specialties ?? '—'} />
            <Field label="Endereço" value={provider.address ?? '—'} />
          </div>
          {provider.notes && (
            <div className="mt-4">
              <p className="text-xs text-ink-subtle">Observações</p>
              <p className="mt-0.5 text-sm text-ink">{provider.notes}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <UpdateProviderModal open={editOpen} onClose={() => setEditOpen(false)} provider={provider} />
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
