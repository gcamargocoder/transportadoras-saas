'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { StatCard } from '../../../../components/ui/stat-card';
import { ProposalFormModal } from '../../../../features/proposals/proposal-form-modal';
import { useAuth } from '../../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { getProposal, getProposalHistory, updateProposalStatus } from '../../../../lib/api/proposals.api';
import { PROPOSAL_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE, labelOrValue } from '../../../../lib/labels';
import { useToast } from '../../../../components/ui/toast';
import type { ProposalStatus } from '../../../../types/enums';
import { formatCurrency, formatDate, formatDateTime } from '../../../../utils/format';

const HISTORY_LIMIT = 10;

// DRAFT e o UNICO estado com conteudo editavel (mesmo mapa de transicoes do
// backend, ver ProposalsService -- so para a UI decidir o que oferecer, o
// backend continua a unica autoridade real).
const NEXT_STATUSES: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export default function ProposalDetailPage(): JSX.Element {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const proposalId = params.id;
  const [editOpen, setEditOpen] = useState(false);

  const proposalQuery = useQuery({
    queryKey: ['proposals', proposalId],
    queryFn: () => getProposal(proposalId),
  });

  const historyQuery = useQuery({
    queryKey: ['proposals', proposalId, 'history', { pageSize: HISTORY_LIMIT }],
    queryFn: () => getProposalHistory(proposalId, { pageSize: HISTORY_LIMIT }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: ProposalStatus) => updateProposalStatus(proposalId, status),
    onSuccess: () => {
      toast.success('Status da proposta atualizado.');
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  if (proposalQuery.isLoading) return <LoadingState label="Carregando proposta" />;
  if (proposalQuery.isError || !proposalQuery.data) return <ErrorState onRetry={() => proposalQuery.refetch()} />;

  const proposal = proposalQuery.data;
  const canWrite = hasRole(user?.role, PROPOSAL_WRITE_ROLES);
  const canEditContent = canWrite && proposal.status === 'DRAFT';
  const nextStatuses = NEXT_STATUSES[proposal.status];

  return (
    <div>
      <PageHeader
        title={`Proposta #${proposal.number} — ${proposal.customerName ?? 'Cliente'}`}
        description={`Emitida em ${formatDate(proposal.issuedAt)}`}
        breadcrumb={[{ label: 'Propostas', href: '/proposals' }, { label: `#${proposal.number}` }]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={PROPOSAL_STATUS_TONE[proposal.status]}>{PROPOSAL_STATUS_LABELS[proposal.status]}</Badge>
            {proposal.expired && !['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(proposal.status) && (
              <Badge tone="danger">Expirada</Badge>
            )}
            {canEditContent && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Editar
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Valor total" value={formatCurrency(proposal.totalAmount)} tone="brand" />
          <StatCard label="Emitida em" value={formatDate(proposal.issuedAt)} />
          <StatCard label="Validade" value={formatDate(proposal.validUntil)} tone={proposal.expired ? 'danger' : 'success'} />
          <StatCard label="Decisão do cliente" value={proposal.decidedAt ? formatDate(proposal.decidedAt) : '—'} />
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
                  {labelOrValue(PROPOSAL_STATUS_LABELS, s)}
                </Button>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Cliente e origem" />
            <div className="flex flex-col gap-1 px-5 py-4 text-sm">
              <a href={`/customers/${proposal.customerId}`} className="font-medium text-brand-700 hover:underline">
                {proposal.customerName ?? '—'}
              </a>
              {proposal.quotationId ? (
                <a href={`/quotations/${proposal.quotationId}`} className="mt-1 text-brand-700 hover:underline">
                  Ver cotação de origem ({proposal.quotationOriginLocationName ?? '—'} → {proposal.quotationDestinationLocationName ?? '—'})
                </a>
              ) : (
                <p className="mt-1 text-ink-subtle">Proposta criada diretamente, sem cotação de origem.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Condições comerciais" />
            <p className="whitespace-pre-wrap px-5 py-4 text-sm text-ink">
              {proposal.commercialConditions ?? '—'}
            </p>
          </Card>
        </div>

        {proposal.notes && (
          <Card>
            <CardHeader title="Observações comerciais" />
            <p className="whitespace-pre-wrap px-5 py-4 text-sm text-ink">{proposal.notes}</p>
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

      <ProposalFormModal open={editOpen} onClose={() => setEditOpen(false)} proposal={proposal} />
    </div>
  );
}
