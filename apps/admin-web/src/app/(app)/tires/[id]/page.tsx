'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody } from '../../../../components/ui/card';
import { DataTable } from '../../../../components/ui/data-table';
import { EmptyState } from '../../../../components/ui/empty-state';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { Tabs } from '../../../../components/ui/tabs';
import { useAuth } from '../../../../hooks/use-auth';
import { CreateDisposalModal } from '../../../../features/tires/create-disposal-modal';
import { CreateInspectionModal } from '../../../../features/tires/create-inspection-modal';
import { CreateMovementModal } from '../../../../features/tires/create-movement-modal';
import { CreateRetreadModal } from '../../../../features/tires/create-retread-modal';
import { TIRE_STATUS_TONE } from '../../../../features/tires/status';
import {
  getTire,
  getTireHistory,
  getTireInspections,
  getTireMovements,
  getTireRetreads,
} from '../../../../lib/api/tires.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { TIRE_LOCATION_LABELS, TIRE_STATUS_LABELS } from '../../../../lib/labels';
import type {
  TireInspectionEntity,
  TireMovementEntity,
  TireRetreadEntity,
} from '../../../../types/entities';
import { formatCurrency, formatDate, formatNumber } from '../../../../utils/format';

type TabValue = 'overview' | 'history' | 'movements' | 'retreads' | 'inspections';

export default function TireDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const tireId = params.id;
  const { user } = useAuth();
  const [tab, setTab] = useState<TabValue>('overview');
  const [movementOpen, setMovementOpen] = useState(false);
  const [retreadOpen, setRetreadOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [disposalOpen, setDisposalOpen] = useState(false);

  const tireQuery = useQuery({ queryKey: ['tires', tireId], queryFn: () => getTire(tireId) });
  const historyQuery = useQuery({
    queryKey: ['tires', tireId, 'history'],
    queryFn: () => getTireHistory(tireId),
    enabled: tab === 'history',
  });
  const movementsQuery = useQuery({
    queryKey: ['tires', tireId, 'movements'],
    queryFn: () => getTireMovements(tireId, { pageSize: 50 }),
    enabled: tab === 'movements',
  });
  const retreadsQuery = useQuery({
    queryKey: ['tires', tireId, 'retreads'],
    queryFn: () => getTireRetreads(tireId, { pageSize: 50 }),
    enabled: tab === 'retreads',
  });
  const inspectionsQuery = useQuery({
    queryKey: ['tires', tireId, 'inspections'],
    queryFn: () => getTireInspections(tireId, { pageSize: 50 }),
    enabled: tab === 'inspections',
  });

  const movementColumns = useMemo<ColumnDef<TireMovementEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.movementDate) },
      {
        header: 'Origem',
        accessorFn: (row) => TIRE_LOCATION_LABELS[row.previousLocationType ?? 'STOCK'],
      },
      { header: 'Destino', accessorFn: (row) => TIRE_LOCATION_LABELS[row.newLocationType] },
      { header: 'Posição', accessorFn: (row) => row.newPosition ?? '-' },
      { header: 'Responsável', accessorFn: (row) => row.creatorName ?? '-' },
    ],
    [],
  );

  const retreadColumns = useMemo<ColumnDef<TireRetreadEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.retreadDate) },
      { header: 'Recapadora', accessorFn: (row) => row.company },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.cost) },
      { header: 'Garantia', accessorFn: (row) => row.warranty ?? '-' },
    ],
    [],
  );

  const inspectionColumns = useMemo<ColumnDef<TireInspectionEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.inspectionDate) },
      { header: 'Sulco', cell: ({ row }) => `${formatNumber(row.original.treadDepthMm, 1)} mm` },
      {
        header: 'Pressão',
        cell: ({ row }) => (row.original.pressurePsi ? `${row.original.pressurePsi} PSI` : '-'),
      },
      { header: 'Responsável', accessorFn: (row) => row.creatorName ?? '-' },
    ],
    [],
  );

  if (tireQuery.isLoading) return <LoadingState label="Carregando pneu" />;
  if (tireQuery.isError || !tireQuery.data)
    return <ErrorState onRetry={() => tireQuery.refetch()} />;

  const tire = tireQuery.data;
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);
  const isScrapped = tire.status === 'SCRAPPED';

  return (
    <div>
      <PageHeader
        title={tire.fireNumber}
        description={`${tire.manufacturer} ${tire.model} · ${tire.size}`}
        breadcrumb={[{ label: 'Pneus', href: '/tires' }, { label: tire.fireNumber }]}
        actions={
          <>
            <Badge tone={TIRE_STATUS_TONE[tire.status]}>{TIRE_STATUS_LABELS[tire.status]}</Badge>
            {canWrite && !isScrapped && (
              <Button variant="danger" size="sm" onClick={() => setDisposalOpen(true)}>
                <Trash2 size={14} />
                Descartar
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field
              label="Localização"
              value={
                tire.locationType === 'VEHICLE'
                  ? `Veículo ${tire.vehiclePlate ?? '?'}`
                  : tire.locationType === 'TRAILER'
                    ? `Carreta ${tire.trailerPlate ?? '?'}`
                    : 'Estoque'
              }
            />
            <Field label="Posição" value={tire.position ?? '-'} />
            <Field
              label="Sulco atual"
              value={
                tire.currentTreadDepthMm ? `${formatNumber(tire.currentTreadDepthMm, 1)} mm` : '-'
              }
            />
            <Field
              label="Sulco inicial"
              value={
                tire.initialTreadDepthMm ? `${formatNumber(tire.initialTreadDepthMm, 1)} mm` : '-'
              }
            />
            <Field
              label="Vida útil prevista"
              value={tire.expectedLifespanKm ? `${formatNumber(tire.expectedLifespanKm)} km` : '-'}
            />
            <Field label="Valor de compra" value={formatCurrency(tire.purchasePrice)} />
            <Field label="DOT" value={tire.dot ?? '-'} />
            <Field label="Data de compra" value={formatDate(tire.purchaseDate)} />
          </div>
        </CardBody>
        {tire.lifecycle && (
          <CardBody className="border-t border-border">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Custo total (compra + recapagens)" value={formatCurrency(tire.lifecycle.totalCost)} />
              <Field label="Intervenções registradas" value={String(tire.lifecycle.interventionsCount)} />
              <Field
                label="Dias instalado"
                value={tire.lifecycle.daysInstalled !== null ? `${tire.lifecycle.daysInstalled} dia(s)` : '-'}
              />
              <Field
                label="Custo por km"
                value={
                  tire.lifecycle.costPerKm.available && tire.lifecycle.costPerKm.value !== null
                    ? `${formatCurrency(tire.lifecycle.costPerKm.value)}/km`
                    : 'Indisponível (odômetro insuficiente)'
                }
              />
            </div>
          </CardBody>
        )}
      </Card>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'history', label: 'Histórico' },
          { value: 'movements', label: 'Movimentações' },
          { value: 'retreads', label: 'Recapagens' },
          { value: 'inspections', label: 'Inspeções' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        {tab === 'overview' && (
          <CardBody>
            <p className="text-sm text-ink-muted">
              Consulte o histórico consolidado, movimentações, recapagens e inspeções nas abas
              acima.
            </p>
          </CardBody>
        )}

        {tab === 'history' && (
          <div className="p-4">
            {historyQuery.isLoading && <LoadingState label="Carregando histórico" />}
            {historyQuery.data && historyQuery.data.events.length === 0 && (
              <EmptyState title="Nenhum evento registrado" />
            )}
            {historyQuery.data && historyQuery.data.events.length > 0 && (
              <ul className="flex flex-col gap-2">
                {historyQuery.data.events.map((event, index) => (
                  <li key={index} className="rounded-md border border-border p-3 text-sm">
                    <p className="font-medium text-ink">{event.description}</p>
                    <p className="text-xs text-ink-subtle">{formatDate(event.date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'movements' && (
          <div>
            {canWrite && !isScrapped && (
              <div className="flex justify-end p-3">
                <Button size="sm" onClick={() => setMovementOpen(true)}>
                  <Plus size={14} />
                  Nova movimentação
                </Button>
              </div>
            )}
            <DataTable
              columns={movementColumns}
              data={movementsQuery.data?.items ?? []}
              isLoading={movementsQuery.isLoading}
              isError={movementsQuery.isError}
              getRowId={(m) => m.id}
              emptyTitle="Nenhuma movimentação registrada"
            />
          </div>
        )}

        {tab === 'retreads' && (
          <div>
            {canWrite && !isScrapped && (
              <div className="flex justify-end p-3">
                <Button size="sm" onClick={() => setRetreadOpen(true)}>
                  <Plus size={14} />
                  Nova recapagem
                </Button>
              </div>
            )}
            <DataTable
              columns={retreadColumns}
              data={retreadsQuery.data?.items ?? []}
              isLoading={retreadsQuery.isLoading}
              isError={retreadsQuery.isError}
              getRowId={(r) => r.id}
              emptyTitle="Nenhuma recapagem registrada"
            />
          </div>
        )}

        {tab === 'inspections' && (
          <div>
            {canWrite && !isScrapped && (
              <div className="flex justify-end p-3">
                <Button size="sm" onClick={() => setInspectionOpen(true)}>
                  <Plus size={14} />
                  Nova inspeção
                </Button>
              </div>
            )}
            <DataTable
              columns={inspectionColumns}
              data={inspectionsQuery.data?.items ?? []}
              isLoading={inspectionsQuery.isLoading}
              isError={inspectionsQuery.isError}
              getRowId={(i) => i.id}
              emptyTitle="Nenhuma inspeção registrada"
            />
          </div>
        )}
      </div>

      <CreateMovementModal
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        tireId={tireId}
      />
      <CreateRetreadModal
        open={retreadOpen}
        onClose={() => setRetreadOpen(false)}
        tireId={tireId}
      />
      <CreateInspectionModal
        open={inspectionOpen}
        onClose={() => setInspectionOpen(false)}
        tireId={tireId}
      />
      <CreateDisposalModal
        open={disposalOpen}
        onClose={() => setDisposalOpen(false)}
        tireId={tireId}
      />
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
