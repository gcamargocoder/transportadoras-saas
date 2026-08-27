'use client';

import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../../../components/ui/badge';
import { Button } from '../../../../../../components/ui/button';
import { Card, CardHeader } from '../../../../../../components/ui/card';
import { ErrorState } from '../../../../../../components/ui/error-state';
import { LoadingState } from '../../../../../../components/ui/loading-state';
import { PageHeader } from '../../../../../../components/ui/page-header';
import { StatCard } from '../../../../../../components/ui/stat-card';
import { OpportunityFormModal } from '../../../../../../features/pipeline/opportunity-form-modal';
import { StageMoveDropdown } from '../../../../../../features/pipeline/stage-move-dropdown';
import { useAuth } from '../../../../../../hooks/use-auth';
import { getPipelineOpportunity, getPipelineOpportunityHistory, listPipelineStages } from '../../../../../../lib/api/pipeline.api';
import { PIPELINE_WRITE_ROLES, hasRole } from '../../../../../../lib/auth/roles';
import { formatCurrency, formatDate, formatDateTime } from '../../../../../../utils/format';

const HISTORY_LIMIT = 10;

export default function PipelineOpportunityDetailPage(): JSX.Element {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const opportunityId = params.id;
  const [editOpen, setEditOpen] = useState(false);

  const opportunityQuery = useQuery({
    queryKey: ['pipeline', 'opportunities', opportunityId],
    queryFn: () => getPipelineOpportunity(opportunityId),
  });
  const stagesQuery = useQuery({ queryKey: ['pipeline', 'stages'], queryFn: () => listPipelineStages() });
  const historyQuery = useQuery({
    queryKey: ['pipeline', 'opportunities', opportunityId, 'history', { pageSize: HISTORY_LIMIT }],
    queryFn: () => getPipelineOpportunityHistory(opportunityId, { pageSize: HISTORY_LIMIT }),
  });

  if (opportunityQuery.isLoading) return <LoadingState label="Carregando oportunidade" />;
  if (opportunityQuery.isError || !opportunityQuery.data) return <ErrorState onRetry={() => opportunityQuery.refetch()} />;

  const opportunity = opportunityQuery.data;
  const canWrite = hasRole(user?.role, PIPELINE_WRITE_ROLES);
  const isTerminal = Boolean(opportunity.stageIsWon || opportunity.stageIsLost);

  return (
    <div>
      <PageHeader
        title={opportunity.title || opportunity.customerName || 'Oportunidade'}
        description={opportunity.customerName ?? undefined}
        breadcrumb={[
          { label: 'Pipeline Comercial', href: '/operations/commercial/pipeline' },
          { label: opportunity.title || `#${opportunity.id.slice(0, 8)}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={opportunity.stageIsWon ? 'success' : opportunity.stageIsLost ? 'danger' : 'neutral'}>
              {opportunity.stageName ?? '—'}
            </Badge>
            {canWrite && !isTerminal && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Editar
              </Button>
            )}
            {canWrite && stagesQuery.data && (
              <StageMoveDropdown
                opportunityId={opportunity.id}
                currentStageId={opportunity.stageId}
                currentStageIsWon={opportunity.stageIsWon}
                currentStageIsLost={opportunity.stageIsLost}
                stages={stagesQuery.data}
                trigger={
                  <Button size="sm" variant="outline">
                    <MoreHorizontal size={14} />
                    Mover estágio
                  </Button>
                }
              />
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Valor estimado" value={formatCurrency(opportunity.estimatedValue)} tone="brand" />
          <StatCard label="Criada em" value={formatDate(opportunity.createdAt)} />
          <StatCard label="Data de ganho" value={opportunity.wonAt ? formatDate(opportunity.wonAt) : '—'} tone="success" />
          <StatCard label="Data de perda" value={opportunity.lostAt ? formatDate(opportunity.lostAt) : '—'} tone="danger" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Cliente e origem" />
            <div className="flex flex-col gap-1 px-5 py-4 text-sm">
              <a href={`/customers/${opportunity.customerId}`} className="font-medium text-brand-700 hover:underline">
                {opportunity.customerName ?? '—'}
              </a>
              {opportunity.quotationId && (
                <a href={`/quotations/${opportunity.quotationId}`} className="mt-1 text-brand-700 hover:underline">
                  Ver cotação relacionada
                </a>
              )}
              {opportunity.proposalId && (
                <a href={`/proposals/${opportunity.proposalId}`} className="mt-1 text-brand-700 hover:underline">
                  Ver proposta relacionada {opportunity.proposalNumber ? `(#${opportunity.proposalNumber})` : ''}
                </a>
              )}
              {!opportunity.quotationId && !opportunity.proposalId && (
                <p className="mt-1 text-ink-subtle">Oportunidade criada diretamente, sem cotação/proposta vinculada.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Observações" />
            <p className="whitespace-pre-wrap px-5 py-4 text-sm text-ink">{opportunity.notes ?? '—'}</p>
          </Card>
        </div>

        {opportunity.stageIsLost && opportunity.lostReason && (
          <Card>
            <CardHeader title="Motivo da perda" />
            <p className="whitespace-pre-wrap px-5 py-4 text-sm text-ink">{opportunity.lostReason}</p>
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

      <OpportunityFormModal open={editOpen} onClose={() => setEditOpen(false)} opportunity={opportunity} />
    </div>
  );
}
