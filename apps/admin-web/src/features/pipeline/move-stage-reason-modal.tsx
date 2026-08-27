'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { updatePipelineOpportunityStage } from '../../lib/api/pipeline.api';

// Fase 96 -- motivo obrigatorio ao mover para um estagio de perda
// (isLost=true) -- regra da fase, validada de verdade no backend; este
// modal so evita a rejeicao previsivel de submeter sem motivo.
export function MoveStageReasonModal({
  open,
  onClose,
  opportunityId,
  stageId,
  stageName,
}: {
  open: boolean;
  onClose: () => void;
  opportunityId: string;
  stageId: string;
  stageName: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => updatePipelineOpportunityStage(opportunityId, stageId, reason.trim()),
    onSuccess: () => {
      toast.success('Oportunidade movida.');
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setReason('');
      onClose();
    },
    onError: (error) => toast.error('Não foi possível mover a oportunidade.', toFriendlyMessage(error)),
  });

  function handleClose() {
    setReason('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Mover para "${stageName}"`}
      description="Este estágio marca a oportunidade como perdida. Informe o motivo."
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={reason.trim().length < 2}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Confirmar perda
          </Button>
        </>
      }
    >
      <FormField label="Motivo da perda" htmlFor="lost-reason" required>
        <textarea
          id="lost-reason"
          className="min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Preço acima do concorrente, cliente adiou o projeto..."
        />
      </FormField>
    </Modal>
  );
}
