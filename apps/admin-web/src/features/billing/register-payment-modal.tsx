'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { registerPayment } from '../../lib/api/billing.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { SUBSCRIPTION_PAYMENT_METHOD_LABELS, SUBSCRIPTION_PAYMENT_STATUS_LABELS } from '../../lib/labels';
import type { SubscriptionEntity } from '../../types/entities';
import type { SubscriptionPaymentMethod, SubscriptionPaymentStatus } from '../../types/enums';
import { formatDateInputValue } from '../../utils/format';

const ALL_METHODS = Object.keys(SUBSCRIPTION_PAYMENT_METHOD_LABELS) as SubscriptionPaymentMethod[];
const ALL_STATUSES = Object.keys(SUBSCRIPTION_PAYMENT_STATUS_LABELS) as SubscriptionPaymentStatus[];

const schema = z.object({
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  paidAt: z.string().optional(),
  paymentMethod: z.string().min(1),
  status: z.string().min(1),
  reference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Fase 50 -- cada envio cria uma linha NOVA no historico (ledger imutavel).
// "Marcar como pago/pendente/atrasado" (secao 4 do pedido) e sempre este
// mesmo formulario, so muda o status escolhido -- nunca uma edicao de um
// pagamento anterior.
export function RegisterPaymentModal({
  subscription,
  onClose,
}: {
  subscription: SubscriptionEntity | null;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const status = watch('status');

  useEffect(() => {
    if (subscription) {
      reset({
        amount: subscription.amount,
        dueDate: formatDateInputValue(subscription.nextDueDate),
        paidAt: formatDateInputValue(new Date().toISOString()),
        paymentMethod: subscription.paymentMethod,
        status: 'PAID',
        reference: '',
      });
    }
  }, [subscription, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!subscription) throw new Error('Assinatura nao selecionada.');
      return registerPayment(subscription.id, {
        amount: values.amount,
        dueDate: new Date(values.dueDate).toISOString(),
        paidAt: values.paidAt ? new Date(values.paidAt).toISOString() : undefined,
        paymentMethod: values.paymentMethod as SubscriptionPaymentMethod,
        status: values.status as SubscriptionPaymentStatus,
        reference: values.reference || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Pagamento registrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'billing'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível registrar o pagamento.', toFriendlyMessage(error)),
  });

  function handleClose() {
    onClose();
  }

  return (
    <Modal
      open={Boolean(subscription)}
      onClose={handleClose}
      title="Registrar pagamento"
      description={subscription?.tenantName ?? ''}
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
        <FormField label="Status" htmlFor="payment-status" required error={errors.status?.message} className="sm:col-span-2">
          <Select id="payment-status" invalid={Boolean(errors.status)} {...register('status')}>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_PAYMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Valor (R$)" htmlFor="payment-amount" required error={errors.amount?.message}>
          <Input id="payment-amount" type="number" step="0.01" min="0" invalid={Boolean(errors.amount)} {...register('amount')} />
        </FormField>

        <FormField label="Método" htmlFor="payment-method" required error={errors.paymentMethod?.message}>
          <Select id="payment-method" invalid={Boolean(errors.paymentMethod)} {...register('paymentMethod')}>
            {ALL_METHODS.map((m) => (
              <option key={m} value={m}>
                {SUBSCRIPTION_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Vencimento" htmlFor="payment-due-date" required error={errors.dueDate?.message}>
          <Input id="payment-due-date" type="date" invalid={Boolean(errors.dueDate)} {...register('dueDate')} />
        </FormField>

        <FormField
          label="Data do recebimento"
          htmlFor="payment-paid-at"
          hint={status === 'PAID' ? 'Recomendado quando o status é Pago' : 'Opcional'}
        >
          <Input id="payment-paid-at" type="date" {...register('paidAt')} />
        </FormField>

        <FormField label="Referência" htmlFor="payment-reference" className="sm:col-span-2" hint="Opcional -- ex: id do comprovante PIX">
          <Input id="payment-reference" {...register('reference')} />
        </FormField>
      </form>
    </Modal>
  );
}
