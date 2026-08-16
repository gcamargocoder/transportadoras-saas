'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, FileUp, Files, Link2, Link2Off, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { Input } from '../../../../../components/ui/input';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { FiscalDocumentDetailDrawer } from '../../../../../features/fiscal/fiscal-document-detail-drawer';
import { ImportFiscalXmlModal } from '../../../../../features/fiscal/import-fiscal-xml-modal';
import { UploadFiscalDocumentModal } from '../../../../../features/fiscal/upload-fiscal-document-modal';
import { useAuth } from '../../../../../hooks/use-auth';
import { listDrivers } from '../../../../../lib/api/drivers.api';
import { getFiscalDashboard, listFiscalDocuments } from '../../../../../lib/api/fiscal.api';
import { listVehicles } from '../../../../../lib/api/fleet.api';
import { hasRole, FISCAL_DOCUMENT_WRITE_ROLES } from '../../../../../lib/auth/roles';
import {
  FISCAL_DOCUMENT_STATUS_LABELS,
  FISCAL_DOCUMENT_STATUS_TONE,
  FISCAL_DOCUMENT_TYPE_LABELS,
  labelOrValue,
} from '../../../../../lib/labels';
import type { FiscalDocumentEntity } from '../../../../../types/entities';
import type { FiscalDocumentStatus, FiscalDocumentType } from '../../../../../types/enums';
import { formatDate } from '../../../../../utils/format';

const PAGE_SIZE = 20;

export default function FiscalDocumentsPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [documentType, setDocumentType] = useState<FiscalDocumentType | ''>('');
  const [status, setStatus] = useState<FiscalDocumentStatus | ''>('');
  const [issueDateFrom, setIssueDateFrom] = useState('');
  const [issueDateTo, setIssueDateTo] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<FiscalDocumentEntity | null>(null);

  const filters = {
    documentType: documentType || undefined,
    status: status || undefined,
    issueDateFrom: issueDateFrom || undefined,
    issueDateTo: issueDateTo || undefined,
    documentNumber: documentNumber || undefined,
    accessKey: accessKey || undefined,
    vehicleId: vehicleId || undefined,
    driverId: driverId || undefined,
  };
  const hasActiveFilters = Boolean(
    documentType || status || issueDateFrom || issueDateTo || documentNumber || accessKey || vehicleId || driverId,
  );

  function clearFilters(): void {
    setDocumentType('');
    setStatus('');
    setIssueDateFrom('');
    setIssueDateTo('');
    setDocumentNumber('');
    setAccessKey('');
    setVehicleId('');
    setDriverId('');
    setPage(1);
  }

  const dashboardQuery = useQuery({
    queryKey: ['fiscal-documents', 'dashboard', filters],
    queryFn: ({ signal }) => getFiscalDashboard(filters, signal),
  });

  const listQuery = useQuery({
    queryKey: ['fiscal-documents', 'list', { page, ...filters }],
    queryFn: ({ signal }) => listFiscalDocuments({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<FiscalDocumentEntity, unknown>[]>(
    () => [
      { header: 'Documento', accessorFn: (row) => row.fileName ?? '—' },
      {
        header: 'Tipo',
        cell: ({ row }) => <Badge tone="brand">{FISCAL_DOCUMENT_TYPE_LABELS[row.original.documentType]}</Badge>,
      },
      { header: 'Número', accessorFn: (row) => row.documentNumber ?? '—' },
      {
        header: 'Chave',
        cell: ({ row }) =>
          row.original.accessKey ? (
            <span className="font-mono text-xs">…{row.original.accessKey.slice(-8)}</span>
          ) : (
            '—'
          ),
      },
      { header: 'Viagem', accessorFn: (row) => row.tripLabel ?? '—' },
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? '—' },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[row.original.status]}>
            {FISCAL_DOCUMENT_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      { header: 'Data', cell: ({ row }) => (row.original.issueDate ? formatDate(row.original.issueDate) : '—') },
      { header: 'Origem', accessorFn: (row) => (row.source === 'XML_IMPORT' ? 'XML' : 'Upload') },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Fiscal"
        description="Documentos fiscais/operacionais da transportadora (CT-e, MDF-e, NF-e, CIOT e outros). Sem emissão fiscal e sem validação oficial perante a SEFAZ nesta fase."
        actions={
          hasRole(user?.role, FISCAL_DOCUMENT_WRITE_ROLES) && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp size={16} />
                Importar XML
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                <Plus size={16} />
                Enviar documento
              </Button>
            </>
          )
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

      {dashboardQuery.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de documentos" value={String(dashboardQuery.data.totalDocuments)} icon={Files} />
            <StatCard label="CT-e" value={String(dashboardQuery.data.cteCount)} />
            <StatCard label="MDF-e" value={String(dashboardQuery.data.mdfeCount)} />
            <StatCard label="NF-e" value={String(dashboardQuery.data.nfeCount)} />
            <StatCard label="CIOT" value={String(dashboardQuery.data.ciotCount)} />
            <StatCard label="Pendentes" value={String(dashboardQuery.data.pendingCount)} tone="info" />
            <StatCard label="Reconhecidos (válidos)" value={String(dashboardQuery.data.validCount)} tone="success" />
            <StatCard
              label="Inválidos"
              value={String(dashboardQuery.data.invalidCount)}
              icon={AlertTriangle}
              tone={dashboardQuery.data.invalidCount > 0 ? 'danger' : 'success'}
            />
            <StatCard label="Vinculados" value={String(dashboardQuery.data.linkedCount)} icon={Link2} tone="success" />
            <StatCard
              label="Sem vínculo"
              value={String(dashboardQuery.data.unlinkedCount)}
              icon={Link2Off}
              tone={dashboardQuery.data.unlinkedCount > 0 ? 'warning' : 'success'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MonthlyChartCard title="Evolução mensal" data={dashboardQuery.data.monthlyEvolution} color="#4f46e5" />
            <BarRankingChart
              title="Distribuição por tipo"
              data={dashboardQuery.data.byType.filter((t) => t.count > 0).map((t) => ({ label: FISCAL_DOCUMENT_TYPE_LABELS[t.type], value: t.count }))}
              color="#4f46e5"
              emptyMessage="Nenhum documento registrado."
            />
            <BarRankingChart
              title="Status dos documentos"
              data={dashboardQuery.data.byStatus.map((s) => ({ label: FISCAL_DOCUMENT_STATUS_LABELS[s.status], value: s.count }))}
              color="#16a34a"
              emptyMessage="Nenhum documento registrado."
            />
          </div>

          {dashboardQuery.data.problematicDocuments.length > 0 && (
            <Card>
              <CardHeader
                title="Documentos pendentes/problemáticos"
                description="PENDING/INVALID mais recentes, no mesmo escopo de filtro acima. Clique para abrir o detalhe."
              />
              <ul className="flex flex-col divide-y divide-border">
                {dashboardQuery.data.problematicDocuments.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedDocument(d)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-surface-subtle"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">
                          {FISCAL_DOCUMENT_TYPE_LABELS[d.documentType]} · {d.documentNumber ?? d.fileName ?? d.id.slice(0, 8)}
                        </span>
                        <span className="block truncate text-xs text-ink-subtle">{d.tripLabel ?? 'Sem viagem vinculada'}</span>
                      </span>
                      <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[d.status]}>{FISCAL_DOCUMENT_STATUS_LABELS[d.status]}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6">
        <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
          <FormField label="Tipo" htmlFor="fiscal-filter-type" className="w-full sm:w-40">
            <Select
              id="fiscal-filter-type"
              value={documentType}
              onChange={(e) => {
                setDocumentType(e.target.value as FiscalDocumentType | '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {(Object.keys(FISCAL_DOCUMENT_TYPE_LABELS) as FiscalDocumentType[]).map((t) => (
                <option key={t} value={t}>
                  {labelOrValue(FISCAL_DOCUMENT_TYPE_LABELS, t)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status" htmlFor="fiscal-filter-status" className="w-full sm:w-40">
            <Select
              id="fiscal-filter-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as FiscalDocumentStatus | '');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {(Object.keys(FISCAL_DOCUMENT_STATUS_LABELS) as FiscalDocumentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {labelOrValue(FISCAL_DOCUMENT_STATUS_LABELS, s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="De" htmlFor="fiscal-filter-from" className="w-full sm:w-40">
            <DatePicker
              id="fiscal-filter-from"
              value={issueDateFrom}
              onChange={(e) => {
                setIssueDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <FormField label="Até" htmlFor="fiscal-filter-to" className="w-full sm:w-40">
            <DatePicker
              id="fiscal-filter-to"
              value={issueDateTo}
              onChange={(e) => {
                setIssueDateTo(e.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <FormField label="Número" htmlFor="fiscal-filter-number" className="w-full sm:w-36">
            <Input
              id="fiscal-filter-number"
              value={documentNumber}
              onChange={(e) => {
                setDocumentNumber(e.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <FormField label="Chave de acesso" htmlFor="fiscal-filter-key" className="w-full sm:w-48">
            <Input
              id="fiscal-filter-key"
              value={accessKey}
              onChange={(e) => {
                setAccessKey(e.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <FormField label="Veículo" htmlFor="fiscal-filter-vehicle" className="w-full sm:w-44">
            <EntitySelect
              id="fiscal-filter-vehicle"
              queryKey={['vehicles', 'select']}
              queryFn={() => listVehicles({ pageSize: 100 })}
              getOptionValue={(v) => v.id}
              getOptionLabel={(v) => v.plate}
              value={vehicleId}
              onChange={(v) => {
                setVehicleId(v);
                setPage(1);
              }}
              placeholder="Todos"
            />
          </FormField>
          <FormField label="Motorista" htmlFor="fiscal-filter-driver" className="w-full sm:w-44">
            <EntitySelect
              id="fiscal-filter-driver"
              queryKey={['drivers', 'select']}
              queryFn={() => listDrivers({ pageSize: 100 })}
              getOptionValue={(d) => d.id}
              getOptionLabel={(d) => d.name}
              value={driverId}
              onChange={(v) => {
                setDriverId(v);
                setPage(1);
              }}
              placeholder="Todos"
            />
          </FormField>
        </FilterBar>

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={columns}
            data={listQuery.data?.items ?? []}
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            onRetry={() => listQuery.refetch()}
            getRowId={(d) => d.id}
            onRowClick={(d) => setSelectedDocument(d)}
            emptyTitle="Nenhum documento fiscal encontrado"
            emptyDescription="Não existem documentos para os filtros selecionados."
          />
          {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
        </div>
      </div>

      <UploadFiscalDocumentModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ImportFiscalXmlModal open={importOpen} onClose={() => setImportOpen(false)} />
      <FiscalDocumentDetailDrawer document={selectedDocument} onClose={() => setSelectedDocument(null)} />
    </div>
  );
}
