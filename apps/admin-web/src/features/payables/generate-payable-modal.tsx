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
import { generatePayableFromExpense } from '../../lib/api/payables.api';

const schema = z.object({
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// POST /payables/from-expense/:expenseId -- nao existe fonte de prazo de
// pagamento padrao no sistema (ver docs/payables.md), entao o vencimento e
// sempre informado aqui pelo usuario.
export function GeneratePayableModal({
  open,
  onClose,
  expenseId,
}: {
  open: boolean;
  onClose: () => void;
  expenseId: string;
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
      generatePayableFromExpense(expenseId, {
        dueDate: new Date(values.dueDate).toISOString(),
        description: values.description || undefined,
      }),
    onSuccess: () => {
      toast.success('Conta a pagar gerada.');
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível gerar a conta a pagar.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Gerar conta a pagar"
      description="Cria um título de pagamento a partir desta despesa aprovada."
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
        <FormField label="Vencimento" htmlFor="payable-due-date" required error={errors.dueDate?.message}>
          <Input id="payable-due-date" type="date" invalid={Boolean(errors.dueDate)} {...register('dueDate')} />
        </FormField>
        <FormField label="Descrição" htmlFor="payable-description" hint="Opcional">
          <Input id="payable-description" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
