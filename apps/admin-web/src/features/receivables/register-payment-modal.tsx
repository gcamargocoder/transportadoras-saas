'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { registerReceivablePayment } from '../../lib/api/receivables.api';
import { RECEIVABLE_PAYMENT_METHOD_LABELS } from '../../lib/labels';

const schema = z.object({
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  paymentDate: z.string().min(1, 'Informe a data do recebimento.'),
  paymentMethod: z.enum(['PIX', 'BANK_TRANSFER', 'BOLETO', 'CASH', 'CHECK', 'CARD', 'OTHER']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// POST /receivables/:id/payments -- o backend e a unica autoridade real
// sobre o limite (nunca ultrapassar o saldo); balance so orienta o usuario
// na UI (max do input), nunca substitui a validacao do servidor.
export function RegisterPaymentModal({
  open,
  onClose,
  receivableId,
  balance,
}: {
  open: boolean;
  onClose: () => void;
  receivableId: string;
  balance: number;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'PIX' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      registerReceivablePayment(receivableId, {
        ...values,
        paymentDate: new Date(values.paymentDate).toISOString(),
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Recebimento registrado.');
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      reset({ paymentMethod: 'PIX' });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível registrar o recebimento.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ paymentMethod: 'PIX' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Registrar recebimento"
      description={`Saldo em aberto: ${balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. O valor nunca pode ultrapassar o saldo.`}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Registrar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Valor (R$)" htmlFor="payment-amount" required error={errors.amount?.message}>
          <Input
            id="payment-amount"
            type="number"
            step="0.01"
            min={0.01}
            max={balance}
            invalid={Boolean(errors.amount)}
            {...register('amount')}
          />
        </FormField>
        <FormField label="Data do recebimento" htmlFor="payment-date" required error={errors.paymentDate?.message}>
          <Input id="payment-date" type="date" invalid={Boolean(errors.paymentDate)} {...register('paymentDate')} />
        </FormField>
        <FormField label="Forma de recebimento" htmlFor="payment-method" required>
          <Select id="payment-method" {...register('paymentMethod')}>
            {Object.entries(RECEIVABLE_PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Referência" htmlFor="payment-reference" hint="Opcional — número do comprovante/transação">
          <Input id="payment-reference" {...register('reference')} />
        </FormField>
        <FormField label="Observações" htmlFor="payment-notes" hint="Opcional" className="sm:col-span-2">
          <Input id="payment-notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
