'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus, ShieldCheck, ShieldOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { DataTable } from '../../../../components/ui/data-table';
import { Dropdown } from '../../../../components/ui/dropdown';
import { LimitIndicator } from '../../../../components/ui/limit-indicator';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { useToast } from '../../../../components/ui/toast';
import { CreateUserModal } from '../../../../features/settings/create-user-modal';
import { useTenantPlan } from '../../../../hooks/use-tenant-plan';
import { listUsers, updateUserStatus } from '../../../../lib/api/admin.api';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { ROLE_LABELS } from '../../../../lib/labels';
import type { UserEntity } from '../../../../types/entities';

const PAGE_SIZE = 20;

export default function UsersSettingsPage(): JSX.Element {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { plan } = useTenantPlan();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['users', { page }],
    queryFn: ({ signal }) => listUsers({ page, pageSize: PAGE_SIZE }, signal),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateUserStatus(id, isActive),
    onSuccess: () => {
      toast.success('Status do usuário atualizado.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar o usuário.', toFriendlyMessage(error)),
  });

  const columns = useMemo<ColumnDef<UserEntity, unknown>[]>(
    () => [
      { header: 'Nome', accessorFn: (row) => row.name },
      { header: 'E-mail', accessorFn: (row) => row.email },
      { header: 'Perfil', accessorFn: (row) => ROLE_LABELS[row.role] },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? 'success' : 'neutral'}>
            {row.original.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Dropdown
            trigger={
              <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                <MoreHorizontal size={16} />
              </span>
            }
            items={[
              row.original.isActive
                ? {
                    label: 'Desativar',
                    icon: <ShieldOff size={14} />,
                    danger: true,
                    onClick: () => statusMutation.mutate({ id: row.original.id, isActive: false }),
                  }
                : {
                    label: 'Ativar',
                    icon: <ShieldCheck size={14} />,
                    onClick: () => statusMutation.mutate({ id: row.original.id, isActive: true }),
                  },
            ]}
          />
        ),
      },
    ],
    [statusMutation],
  );

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Usuários com acesso ao painel administrativo."
        actions={
          <>
            {query.data && (
              <LimitIndicator label="Usuários" current={query.data.meta.total} max={plan?.maxUsers} />
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo usuário
            </Button>
          </>
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          getRowId={(u) => u.id}
          emptyTitle="Nenhum usuário encontrado"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
