'use client';

import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '../../components/ui/badge';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { getPipelineBoard } from '../../lib/api/pipeline.api';
import { formatCurrency } from '../../utils/format';
import { StageMoveDropdown } from './stage-move-dropdown';

// Fase 96 -- Kanban somente leitura + acao de mover (sem drag-and-drop --
// este projeto nao usa nenhuma biblioteca de DnD em nenhuma outra tela,
// ver DeliveryStopsTab que reordena com botoes). Cada coluna mostra o
// total REAL (agregado no banco); os cartoes sao uma amostra limitada (ver
// PIPELINE_BOARD_CARDS_PER_STAGE no backend) -- a lista paginada continua
// a fonte completa.
export function PipelineBoard(): JSX.Element {
  const router = useRouter();
  const boardQuery = useQuery({ queryKey: ['pipeline', 'board'], queryFn: () => getPipelineBoard() });

  if (boardQuery.isLoading) return <LoadingState label="Carregando pipeline" />;
  if (boardQuery.isError || !boardQuery.data) return <ErrorState onRetry={() => boardQuery.refetch()} />;

  const stages = boardQuery.data.columns.map((c) => c.stage);

  return (
    <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-2">
      {boardQuery.data.columns.map((column) => (
        <div key={column.stage.id} className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface-subtle">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{column.stage.name}</p>
              <p className="text-xs text-ink-subtle">
                {column.totalCount} · {formatCurrency(column.totalEstimatedValue)}
              </p>
            </div>
            {column.stage.isWon && <Badge tone="success">Ganho</Badge>}
            {column.stage.isLost && <Badge tone="danger">Perda</Badge>}
          </div>
          <div className="flex flex-col gap-2 p-2">
            {column.opportunities.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-ink-subtle">Nenhuma oportunidade.</p>
            )}
            {column.opportunities.map((opportunity) => (
              <div
                key={opportunity.id}
                className="cursor-pointer rounded-md border border-border bg-white p-3 text-sm shadow-xs hover:border-brand-300"
                onClick={() => router.push(`/operations/commercial/pipeline/${opportunity.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{opportunity.title || opportunity.customerName || 'Oportunidade'}</p>
                    <p className="truncate text-xs text-ink-subtle">{opportunity.customerName ?? '—'}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <StageMoveDropdown
                      opportunityId={opportunity.id}
                      currentStageId={opportunity.stageId}
                      currentStageIsWon={opportunity.stageIsWon}
                      currentStageIsLost={opportunity.stageIsLost}
                      stages={stages}
                      trigger={
                        <span className="rounded-md p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                          <MoreHorizontal size={14} />
                        </span>
                      }
                    />
                  </div>
                </div>
                {opportunity.estimatedValue !== null && (
                  <p className="mt-2 text-sm font-semibold text-ink">{formatCurrency(opportunity.estimatedValue)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
