'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, FileCheck, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { StatCard } from '../../../../components/ui/stat-card';
import { ConvertToTripModal } from '../../../../features/quotations/convert-to-trip-modal';
import { QuotationFormModal } from '../../../../features/quotations/quotation-form-modal';
import { ProposalFormModal } from '../../../../features/proposals/proposal-form-modal';
import { useAuth } from '../../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { getQuotation, getQuotationHistory, updateQuotationStatus } from '../../../../lib/api/quotations.api';
import { QUOTATION_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import {
  QUOTATION_AMOUNT_SOURCE_LABELS,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_TONE,
  VEHICLE_TYPE_LABELS,
  labelOrValue,
} from '../../../../lib/labels';
import { useToast } from '../../../../components/ui/toast';
import type { QuotationStatus } from '../../../../types/enums';
import { formatCurrency, formatDate, formatDateTime } from '../../../../utils/format';

const HISTORY_LIMIT = 10;

// DRAFT/SENT permitem edicao de conteudo; qualquer estado final bloqueia
// (mesmo mapa de transicoes do backend, ver QuotationsService -- so para a
// UI decidir o que oferecer, o backend continua a unica autoridade real).
const EDITABLE_STATUSES: QuotationStatus[] = ['DRAFT', 'SENT'];
const NEXT_STATUSES: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CONVERTED: [],
  CANCELLED: [],
};

export default function QuotationDetailPage(): JSX.Element {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const quotationId = params.id;
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  const quotationQuery = useQuery({
    queryKey: ['quotations', quotationId],
    queryFn: () => getQuotation(quotationId),
  });

  const historyQuery = useQuery({
    queryKey: ['quotations', quotationId, 'history', { pageSize: HISTORY_LIMIT }],
    queryFn: () => getQuotationHistory(quotationId, { pageSize: HISTORY_LIMIT }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: QuotationStatus) => updateQuotationStatus(quotationId, status),
    onSuccess: () => {
      toast.success('Status da cotação atualizado.');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  if (quotationQuery.isLoading) return <LoadingState label="Carregando cotação" />;
  if (quotationQuery.isError || !quotationQuery.data) return <ErrorState onRetry={() => quotationQuery.refetch()} />;

  const quotation = quotationQuery.data;
  const canWrite = hasRole(user?.role, QUOTATION_WRITE_ROLES);
  const canEditContent = canWrite && EDITABLE_STATUSES.includes(quotation.status);
  const nextStatuses = NEXT_STATUSES[quotation.status];

  return (
    <div>
      <PageHeader
        title={`Cotação — ${quotation.customerName ?? 'Cliente'}`}
        description={`${quotation.originLocationName ?? '—'} → ${quotation.destinationLocationName ?? '—'}`}
        breadcrumb={[{ label: 'Cotações', href: '/quotations' }, { label: quotation.customerName ?? quotation.id }]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={QUOTATION_STATUS_TONE[quotation.status]}>{QUOTATION_STATUS_LABELS[quotation.status]}</Badge>
            {quotation.expired && !['CONVERTED', 'REJECTED', 'CANCELLED'].includes(quotation.status) && (
              <Badge tone="danger">Expirada</Badge>
            )}
            {canEditContent && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Editar
              </Button>
            )}
            {canWrite && quotation.status === 'APPROVED' && (
              <Button variant="outline" size="sm" onClick={() => setProposalOpen(true)}>
                <FileCheck size={14} />
                Gerar proposta
              </Button>
            )}
            {canWrite && quotation.status === 'APPROVED' && (
              <Button size="sm" onClick={() => setConvertOpen(true)}>
                <ArrowRightLeft size={14} />
                Converter em viagem
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Valor cotado" value={formatCurrency(quotation.amount)} tone="brand" />
          <StatCard label="Origem do valor" value={QUOTATION_AMOUNT_SOURCE_LABELS[quotation.amountSource]} />
          <StatCard
            label="Validade"
            value={formatDate(quotation.validUntil)}
            tone={quotation.expired ? 'danger' : 'success'}
          />
          <StatCard label="Criada em" value={formatDate(quotation.createdAt)} />
        </div>

        {canWrite && nextStatuses.length > 0 && (
          <Card>
            <CardHeader title="Alterar status" description="Transições disponíveis a partir do status atual." />
            <div className="flex flex-wrap gap-2 p-5 pt-0">
              {nextStatuses.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  loading={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(s)}
                >
                  {labelOrValue(QUOTATION_STATUS_LABELS, s)}
                </Button>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Cliente" />
            <div className="flex flex-col gap-1 px-5 py-4 text-sm">
              <a href={`/customers/${quotation.customerId}`} className="font-medium text-brand-700 hover:underline">
                {quotation.customerName ?? '—'}
              </a>
              {quotation.customerContactName && (
                <p className="text-ink-subtle">Contato: {quotation.customerContactName}</p>
              )}
              {quotation.convertedTripId && (
                <a href={`/trips/${quotation.convertedTripId}`} className="mt-2 text-brand-700 hover:underline">
                  Ver viagem convertida
                </a>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Carga e transporte" />
            <dl className="grid grid-cols-2 gap-y-2 px-5 py-4 text-sm">
              <dt className="text-ink-subtle">Carga/mercadoria</dt>
              <dd className="text-right">{quotation.cargoType ?? '—'}</dd>
              <dt className="text-ink-subtle">Peso</dt>
              <dd className="text-right">{quotation.weightKg !== null ? `${quotation.weightKg} kg` : '—'}</dd>
              <dt className="text-ink-subtle">Cubagem</dt>
              <dd className="text-right">{quotation.cubageM3 !== null ? `${quotation.cubageM3} m³` : '—'}</dd>
              <dt className="text-ink-subtle">Tipo de veículo</dt>
              <dd className="text-right">{quotation.vehicleType ? labelOrValue(VEHICLE_TYPE_LABELS, quotation.vehicleType) : '—'}</dd>
            </dl>
          </Card>
        </div>

        {quotation.conditions && (
          <Card>
            <CardHeader title="Condições e observações" />
            <p className="whitespace-pre-wrap px-5 py-4 text-sm text-ink">{quotation.conditions}</p>
          </Card>
        )}

        {quotation.amountSource === 'CALCULATED' && (
          <Card>
            <CardHeader
              title="Composição do valor calculado"
              description={quotation.freightTableName ? `Tabela: ${quotation.freightTableName}` : undefined}
            />
            <dl className="grid grid-cols-2 gap-y-2 px-5 py-4 text-sm sm:grid-cols-4">
              <dt className="text-ink-subtle">Base</dt>
              <dd className="text-right">{formatCurrency(quotation.baseAmount)}</dd>
              <dt className="text-ink-subtle">Adicionais</dt>
              <dd className="text-right">{formatCurrency(quotation.additionsAmount)}</dd>
              <dt className="text-ink-subtle">Pedágio</dt>
              <dd className="text-right">{formatCurrency(quotation.tollAmount)}</dd>
              <dt className="text-ink-subtle">Taxas</dt>
              <dd className="text-right">{formatCurrency(quotation.feesAmount)}</dd>
            </dl>
          </Card>
        )}

        <Card>
          <CardHeader title="Histórico de alterações" description="Registros mais recentes primeiro." />
          <ul className="divide-y divide-border">
            {historyQuery.data?.items.length === 0 && (
              <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum registro de histórico ainda.</li>
            )}
            {historyQuery.data?.items.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-ink">{h.action}</span>
                <span className="text-xs text-ink-subtle">{formatDateTime(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <QuotationFormModal open={editOpen} onClose={() => setEditOpen(false)} quotation={quotation} />
      <ConvertToTripModal open={convertOpen} onClose={() => setConvertOpen(false)} quotationId={quotation.id} />
      <ProposalFormModal
        open={proposalOpen}
        onClose={() => setProposalOpen(false)}
        defaultCustomerId={quotation.customerId}
        defaultQuotationId={quotation.id}
      />
    </div>
  );
}
