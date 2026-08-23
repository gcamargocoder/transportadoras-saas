'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { generateReceivableFromBilling } from '../../lib/api/receivables.api';

const schema = z.object({
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// POST /receivables/from-billing/:billingId -- nao existe nenhuma fonte de
// prazo de pagamento padrao no sistema (ver docs/receivables.md), entao o
// vencimento e sempre informado aqui pelo usuario.
export function GenerateReceivableModal({
  open,
  onClose,
  billingId,
}: {
  open: boolean;
  onClose: () => void;
  billingId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      generateReceivableFromBilling(billingId, {
        dueDate: new Date(values.dueDate).toISOString(),
        description: values.description || undefined,
      }),
    onSuccess: () => {
      toast.success('Conta a receber gerada.');
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível gerar a conta a receber.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Gerar conta a receber"
      description="Cria um título de cobrança a partir do valor já faturado desta viagem."
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Gerar
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Vencimento" htmlFor="receivable-due-date" required error={errors.dueDate?.message}>
          <Input id="receivable-due-date" type="date" invalid={Boolean(errors.dueDate)} {...register('dueDate')} />
        </FormField>
        <FormField label="Descrição" htmlFor="receivable-description" hint="Opcional">
          <Input id="receivable-description" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
