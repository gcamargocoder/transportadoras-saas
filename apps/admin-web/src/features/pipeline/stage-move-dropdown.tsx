'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
import { useState } from 'react';
import { Dropdown } from '../../components/ui/dropdown';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { updatePipelineOpportunityStage } from '../../lib/api/pipeline.api';
import type { PipelineStageEntity } from '../../types/entities';
import { MoveStageReasonModal } from './move-stage-reason-modal';

// Fase 96 -- menu de "mover para outro estagio", reutilizado no Kanban e no
// detalhe da oportunidade. Estagios terminais (isWon/isLost) nunca aparecem
// como origem (o backend tambem bloqueia -- isto so evita a rejeicao
// previsivel). Mover para um estagio isLost=true abre o modal de motivo
// (obrigatorio); qualquer outro estagio move imediatamente.
export function StageMoveDropdown({
  opportunityId,
  currentStageId,
  currentStageIsWon,
  currentStageIsLost,
  stages,
  trigger,
}: {
  opportunityId: string;
  currentStageId: string;
  currentStageIsWon: boolean | null;
  currentStageIsLost: boolean | null;
  stages: PipelineStageEntity[];
  trigger: React.ReactNode;
}): JSX.Element | null {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reasonTarget, setReasonTarget] = useState<PipelineStageEntity | null>(null);

  const moveMutation = useMutation({
    mutationFn: (stageId: string) => updatePipelineOpportunityStage(opportunityId, stageId),
    onSuccess: () => {
      toast.success('Oportunidade movida.');
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
    onError: (error) => toast.error('Não foi possível mover a oportunidade.', toFriendlyMessage(error)),
  });

  if (currentStageIsWon || currentStageIsLost) return null;

  const targets = stages.filter((s) => s.isActive && s.id !== currentStageId);
  if (targets.length === 0) return null;

  return (
    <>
      <Dropdown
        trigger={trigger}
        items={targets.map((stage) => ({
          label: stage.name,
          icon: <ArrowRightLeft size={14} />,
          danger: stage.isLost,
          onClick: () => {
            if (stage.isLost) {
              setReasonTarget(stage);
            } else {
              moveMutation.mutate(stage.id);
            }
          },
        }))}
      />
      {reasonTarget && (
        <MoveStageReasonModal
          open={Boolean(reasonTarget)}
          onClose={() => setReasonTarget(null)}
          opportunityId={opportunityId}
          stageId={reasonTarget.id}
          stageName={reasonTarget.name}
        />
      )}
    </>
  );
}
