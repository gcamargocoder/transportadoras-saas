'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { initiateContractRenewal } from '../../lib/api/contract-renewals.api';

// Fase 98 -- inicia o processo de renovacao de UM contrato (ACTIVE ou
// EXPIRED). Nunca altera valores/condicoes do contrato -- so abre o
// processo, que so produz efeito real ao concluir (CompleteRenewalModal).
export function InitiateRenewalModal({
  open,
  onClose,
  contractId,
  contractCode,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string | null;
  contractCode?: string | null | undefined;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => initiateContractRenewal({ contractId: contractId as string, notes: notes || undefined }),
    onSuccess: () => {
      toast.success('Renovação iniciada.');
      queryClient.invalidateQueries({ queryKey: ['contract-renewals'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível iniciar a renovação.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Iniciar renovação"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!contractId}>
            Iniciar renovação
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Contrato <span className="font-medium text-ink">{contractCode ?? contractId}</span>. A vigência e as
          condições atuais são preservadas — nada é alterado até a renovação ser concluída.
        </p>
        <FormField label="Observações" htmlFor="renewal-notes" hint="Opcional">
          <textarea
            id="renewal-notes"
            className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
