'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, Pencil } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { DataTable } from '../../../../components/ui/data-table';
import { ErrorState } from '../../../../components/ui/error-state';
import { FormField } from '../../../../components/ui/form-field';
import { Input } from '../../../../components/ui/input';
import { LoadingState } from '../../../../components/ui/loading-state';
import { Modal } from '../../../../components/ui/modal';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { StatCard } from '../../../../components/ui/stat-card';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { UpdatePartModal } from '../../../../features/parts/update-part-modal';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import {
  getPart,
  getPartMovements,
  registerStockAdjustment,
  registerStockIn,
  registerStockOut,
  updatePartStatus,
} from '../../../../lib/api/parts.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { PART_STOCK_MOVEMENT_TYPE_LABELS } from '../../../../lib/labels';
import type { PartStockMovementEntity } from '../../../../types/entities';
import { formatCurrency, formatDateTime, formatNumber } from '../../../../utils/format';

const PAGE_SIZE = 20;

export default function PartDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);

  const [editOpen, setEditOpen] = useState(false);
  const [inOpen, setInOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);

  const [inQuantity, setInQuantity] = useState('');
  const [inUnitCost, setInUnitCost] = useState('');
  const [inReference, setInReference] = useState('');
  const [outQuantity, setOutQuantity] = useState('');
  const [outReason, setOutReason] = useState('');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const query = useQuery({ queryKey: ['parts', id], queryFn: () => getPart(id) });
  const movementsQuery = useQuery({
    queryKey: ['parts', id, 'movements', movementsPage],
    queryFn: () => getPartMovements(id, { page: movementsPage, pageSize: PAGE_SIZE }),
  });

  function invalidate(): void {
    queryClient.invalidateQueries({ queryKey: ['parts'] });
  }

  const statusMutation = useMutation({
    mutationFn: (active: boolean) => updatePartStatus(id, active),
    onSuccess: () => {
      toast.success('Status da peça atualizado.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const inMutation = useMutation({
    mutationFn: () =>
      registerStockIn(id, {
        quantity: Number(inQuantity),
        unitCost: inUnitCost ? Number(inUnitCost) : undefined,
        reference: inReference || undefined,
      }),
    onSuccess: () => {
      toast.success('Entrada registrada.');
      setInOpen(false);
      setInQuantity('');
      setInUnitCost('');
      setInReference('');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível registrar a entrada.', toFriendlyMessage(error)),
  });

  const outMutation = useMutation({
    mutationFn: () => registerStockOut(id, { quantity: Number(outQuantity), reason: outReason || undefined }),
    onSuccess: () => {
      toast.success('Saída registrada.');
      setOutOpen(false);
      setOutQuantity('');
      setOutReason('');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível registrar a saída.', toFriendlyMessage(error)),
  });

  const adjustMutation = useMutation({
    mutationFn: () => registerStockAdjustment(id, { quantity: Number(adjustQuantity), reason: adjustReason }),
    onSuccess: () => {
      toast.success('Ajuste registrado.');
      setAdjustOpen(false);
      setAdjustQuantity('');
      setAdjustReason('');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível registrar o ajuste.', toFriendlyMessage(error)),
  });

  const movementColumns: ColumnDef<PartStockMovementEntity, unknown>[] = [
    { header: 'Data', cell: ({ row }) => formatDateTime(row.original.movementDate) },
    {
      header: 'Tipo',
      cell: ({ row }) => (
        <Badge tone={row.original.type === 'OUT' ? 'danger' : row.original.type === 'IN' ? 'success' : 'neutral'}>
          {PART_STOCK_MOVEMENT_TYPE_LABELS[row.original.type]}
        </Badge>
      ),
    },
    {
      header: 'Quantidade',
      cell: ({ row }) => `${row.original.type === 'OUT' ? '-' : row.original.quantity > 0 ? '+' : ''}${formatNumber(row.original.quantity)}`,
    },
    { header: 'Custo unit.', cell: ({ row }) => (row.original.unitCost !== null ? formatCurrency(row.original.unitCost) : '—') },
    { header: 'Motivo', accessorFn: (row) => row.reason ?? '—' },
    {
      header: 'Origem',
      cell: ({ row }) =>
        row.original.maintenanceId ? (
          <button
            type="button"
            className="text-brand-700 hover:underline"
            onClick={() => router.push(`/maintenances/${row.original.maintenanceId}`)}
          >
            OS {row.original.maintenanceId.slice(0, 8)}
          </button>
        ) : (
          row.original.reference ?? '—'
        ),
    },
  ];

  if (query.isLoading) return <LoadingState label="Carregando peça" />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const part = query.data;

  return (
    <div>
      <PageHeader
        title={part.name}
        description={`SKU ${part.sku}`}
        breadcrumb={[{ label: 'Peças', href: '/parts' }, { label: part.sku }]}
        actions={
          <>
            {part.isZeroStock ? (
              <Badge tone="danger">Estoque zerado</Badge>
            ) : part.isLowStock ? (
              <Badge tone="warning">Estoque baixo</Badge>
            ) : (
              <Badge tone="success">Estoque normal</Badge>
            )}
            <Badge tone={part.isActive ? 'success' : 'neutral'}>{part.isActive ? 'Ativa' : 'Inativa'}</Badge>
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
          <Button size="sm" onClick={() => setInOpen(true)}>
            Registrar entrada
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOutOpen(true)}>
            Registrar saída
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
            Registrar ajuste
          </Button>
          <Button
            size="sm"
            variant={part.isActive ? 'danger' : 'outline'}
            onClick={() => statusMutation.mutate(!part.isActive)}
            loading={statusMutation.isPending}
          >
            {part.isActive ? <Ban size={14} /> : <CheckCircle2 size={14} />}
            {part.isActive ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Estoque atual" value={`${formatNumber(part.currentStock)} ${part.unit}`} />
        <StatCard label="Estoque mínimo" value={part.minStock !== null ? `${formatNumber(part.minStock)} ${part.unit}` : '—'} />
        <StatCard label="Categoria" value={part.category ?? '—'} />
        <StatCard label="Fabricante" value={part.manufacturer ?? '—'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Identificação" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Descrição" value={part.description ?? '—'} />
              <Field label="Código OEM" value={part.oemCode ?? '—'} />
              <Field label="Unidade" value={part.unit} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-white">
        <CardHeader title="Movimentações de estoque" description="Histórico completo (append-only), mais recente primeiro." />
        <DataTable
          columns={movementColumns}
          data={movementsQuery.data?.items ?? []}
          isLoading={movementsQuery.isLoading}
          isError={movementsQuery.isError}
          getRowId={(m) => m.id}
          emptyTitle="Nenhuma movimentação registrada"
        />
        {movementsQuery.data && <Pagination meta={movementsQuery.data.meta} onPageChange={setMovementsPage} />}
      </div>

      <UpdatePartModal open={editOpen} onClose={() => setEditOpen(false)} part={part} />

      <Modal
        open={inOpen}
        onClose={() => setInOpen(false)}
        title="Registrar entrada"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setInOpen(false)} disabled={inMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => inMutation.mutate()} loading={inMutation.isPending} disabled={!inQuantity}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label="Quantidade" htmlFor="in-quantity" required>
            <Input id="in-quantity" type="number" step="0.01" value={inQuantity} onChange={(e) => setInQuantity(e.target.value)} />
          </FormField>
          <FormField label="Custo unitário (R$)" htmlFor="in-unit-cost" hint="Opcional -- usado para estimar valor de estoque.">
            <Input id="in-unit-cost" type="number" step="0.01" value={inUnitCost} onChange={(e) => setInUnitCost(e.target.value)} />
          </FormField>
          <FormField label="Referência" htmlFor="in-reference" hint="Opcional -- nota fiscal, fornecedor, pedido.">
            <Input id="in-reference" value={inReference} onChange={(e) => setInReference(e.target.value)} />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={outOpen}
        onClose={() => setOutOpen(false)}
        title="Registrar saída"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOutOpen(false)} disabled={outMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => outMutation.mutate()} loading={outMutation.isPending} disabled={!outQuantity}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label="Quantidade" htmlFor="out-quantity" required>
            <Input id="out-quantity" type="number" step="0.01" value={outQuantity} onChange={(e) => setOutQuantity(e.target.value)} />
          </FormField>
          <FormField label="Motivo" htmlFor="out-reason" hint="Opcional">
            <Input id="out-reason" value={outReason} onChange={(e) => setOutReason(e.target.value)} />
          </FormField>
          <p className="text-xs text-ink-subtle">
            Para consumo em uma Ordem de Serviço, vincule a peça na própria OS -- a saída é gerada automaticamente ao
            concluí-la.
          </p>
        </div>
      </Modal>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Registrar ajuste"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjustMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              loading={adjustMutation.isPending}
              disabled={!adjustQuantity || !adjustReason}
            >
              Registrar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label="Quantidade (delta com sinal)" htmlFor="adjust-quantity" required hint="Positivo = para cima, negativo = para baixo.">
            <Input
              id="adjust-quantity"
              type="number"
              step="0.01"
              value={adjustQuantity}
              onChange={(e) => setAdjustQuantity(e.target.value)}
            />
          </FormField>
          <FormField label="Motivo" htmlFor="adjust-reason" required>
            <Input id="adjust-reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          </FormField>
        </div>
      </Modal>
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
