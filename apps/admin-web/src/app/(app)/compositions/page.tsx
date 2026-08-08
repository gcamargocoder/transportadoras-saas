'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { PageHeader } from '../../../components/ui/page-header';
import { useAuth } from '../../../hooks/use-auth';
import { CreateCompositionModal } from '../../../features/fleet/create-composition-modal';
import { listTripCompositions } from '../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { TripCompositionEntity } from '../../../types/entities';
import { formatDate } from '../../../utils/format';

export default function CompositionsPage(): JSX.Element {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['trip-compositions', 'list'],
    queryFn: () => listTripCompositions({ pageSize: 50 }),
  });

  const columns = useMemo<ColumnDef<TripCompositionEntity, unknown>[]>(
    () => [
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate },
      {
        header: 'Carretas',
        cell: ({ row }) =>
          row.original.trailers.length > 0
            ? row.original.trailers.map((t) => t.trailerPlate).join(', ')
            : '-',
      },
      {
        header: 'Eixos',
        cell: ({ row }) =>
          row.original.axleConfiguration ? (
            <Badge tone="brand">{row.original.axleConfiguration.totalAxles} eixos</Badge>
          ) : (
            <span className="text-ink-subtle">Não configurado</span>
          ),
      },
      {
        header: 'Categoria de cobrança',
        cell: ({ row }) => row.original.axleConfiguration?.billableCategory ?? '-',
      },
      { header: 'Criada em', cell: ({ row }) => formatDate(row.original.createdAt) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Composições"
        description="Veículo + carretas + configuração de eixos — usada para criar viagens e para a conferência de pedágio."
        actions={
          hasRole(user?.role, FLEET_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova composição
            </Button>
          )
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          getRowId={(c) => c.id}
          emptyTitle="Nenhuma composição cadastrada"
          emptyDescription="Crie uma composição (veículo + eixos) para conseguir registrar viagens e conferir pedágios com precisão."
        />
      </div>

      <CreateCompositionModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
