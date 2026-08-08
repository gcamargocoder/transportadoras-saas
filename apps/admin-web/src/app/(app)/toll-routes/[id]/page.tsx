'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Power, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { UpdateRouteModal } from '../../../../features/tolls/update-route-modal';
import { RouteStopsEditor } from '../../../../features/tolls/route-stops-editor';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import {
  deleteTollRoute,
  getTollRoute,
  updateTollRouteStatus,
} from '../../../../lib/api/toll-routes.api';
import { TOLL_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';

export default function TollRouteDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const routeId = params.id;
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canEdit = hasRole(user?.role, TOLL_WRITE_ROLES);

  const routeQuery = useQuery({
    queryKey: ['toll-routes', routeId],
    queryFn: () => getTollRoute(routeId),
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) => updateTollRouteStatus(routeId, isActive),
    onSuccess: (updated) => {
      toast.success(updated.isActive ? 'Rota ativada.' : 'Rota desativada.');
      queryClient.invalidateQueries({ queryKey: ['toll-routes'] });
    },
    onError: (error) =>
      toast.error('Não foi possível alterar o status da rota.', toFriendlyMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTollRoute(routeId),
    onSuccess: () => {
      toast.success('Rota excluída com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['toll-routes'] });
      router.push('/toll-routes');
    },
    onError: (error) => {
      toast.error('Não foi possível excluir a rota.', toFriendlyMessage(error));
      setDeleteOpen(false);
    },
  });

  if (routeQuery.isLoading) return <LoadingState label="Carregando rota" />;
  if (routeQuery.isError || !routeQuery.data)
    return <ErrorState onRetry={() => routeQuery.refetch()} />;

  const route = routeQuery.data;

  return (
    <div>
      <PageHeader
        title={route.name}
        description={`${route.originLabel} → ${route.destinationLabel}`}
        breadcrumb={[{ label: 'Rotas de pedágio', href: '/toll-routes' }, { label: route.name }]}
        actions={
          <>
            <Badge tone={route.isActive ? 'success' : 'neutral'}>
              {route.isActive ? 'Ativa' : 'Inativa'}
            </Badge>
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil size={14} />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(!route.isActive)}
                >
                  <Power size={14} />
                  {route.isActive ? 'Desativar' : 'Ativar'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={14} className="text-danger-600" />
                  Excluir
                </Button>
              </>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader
          title="Praças esperadas (em ordem)"
          description="A rota determina, na ordem abaixo, quais praças a viagem deve cruzar — usado na conciliação de pedágio."
        />
        <CardBody>
          <RouteStopsEditor route={route} canEdit={canEdit} />
        </CardBody>
      </Card>

      <UpdateRouteModal open={editOpen} onClose={() => setEditOpen(false)} route={route} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Excluir rota de pedágio"
        description={`Tem certeza que deseja excluir "${route.name}"? Esta ação não pode ser desfeita. Rotas com viagens vinculadas não podem ser excluídas.`}
        confirmLabel="Excluir"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
