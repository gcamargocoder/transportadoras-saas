'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { updateTripDeliveryStopStatus } from '../../lib/api/trips.api';

// Fase 99 -- motivo obrigatorio ao marcar uma parada como FAILED (mesmo
// espirito de MoveStageReasonModal, Fase 96): o backend valida de verdade,
// este modal so evita a rejeicao previsivel de submeter sem motivo.
export function FailDeliveryStopModal({
  open,
  onClose,
  tripId,
  stopId,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  stopId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => updateTripDeliveryStopStatus(tripId, stopId, 'FAILED', reason.trim()),
    onSuccess: () => {
      toast.success('Parada marcada como com falha.');
      queryClient.invalidateQueries({ queryKey: ['trip-delivery-stops', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trip-delivery-stops-eta', tripId] });
      setReason('');
      onClose();
    },
    onError: (error) => toast.error('Não foi possível marcar a parada como com falha.', toFriendlyMessage(error)),
  });

  function handleClose() {
    setReason('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Marcar entrega como com falha"
      description="A entrega foi tentada mas não pôde ser concluída. Informe o motivo."
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
            Confirmar falha
          </Button>
        </>
      }
    >
      <FormField label="Motivo da falha" htmlFor="delivery-stop-failure-reason" required>
        <textarea
          id="delivery-stop-failure-reason"
          className="min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Destinatário ausente, endereço não localizado..."
        />
      </FormField>
    </Modal>
  );
}
