'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Badge } from '../../../../components/ui/badge';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { EmptyState } from '../../../../components/ui/empty-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { getDriver, getDriverDocuments } from '../../../../lib/api/drivers.api';
import { DOCUMENT_TYPE_LABELS } from '../../../../lib/labels';
import { formatDate } from '../../../../utils/format';

export default function DriverDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const driverId = params.id;

  const driverQuery = useQuery({
    queryKey: ['drivers', driverId],
    queryFn: () => getDriver(driverId),
  });
  const documentsQuery = useQuery({
    queryKey: ['drivers', driverId, 'documents'],
    queryFn: () => getDriverDocuments(driverId),
  });

  if (driverQuery.isLoading) return <LoadingState label="Carregando motorista" />;
  if (driverQuery.isError || !driverQuery.data)
    return <ErrorState onRetry={() => driverQuery.refetch()} />;

  const driver = driverQuery.data;

  return (
    <div>
      <PageHeader
        title={driver.name}
        description={`CNH ${driver.cnhNumber} · Categoria ${driver.cnhCategory}`}
        breadcrumb={[{ label: 'Motoristas', href: '/drivers' }, { label: driver.name }]}
        actions={
          <Badge tone={driver.isActive ? 'success' : 'neutral'}>
            {driver.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
        }
      />

      <Card className="mb-6">
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="CPF" value={driver.cpf} />
            <Field label="Telefone" value={driver.phone ?? '-'} />
            <Field label="E-mail" value={driver.email ?? '-'} />
            <Field label="Vencimento CNH" value={formatDate(driver.cnhExpiresAt)} />
            <Field
              label="Cidade/UF"
              value={driver.city ? `${driver.city}/${driver.state ?? ''}` : '-'}
            />
            <Field label="Admissão" value={formatDate(driver.admissionDate)} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Documentos" description="Documentos vinculados ao motorista." />
        <CardBody>
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
        </CardBody>
      </Card>
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
