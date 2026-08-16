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
import { updateSubscription } from '../../lib/api/billing.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import {
  BILLING_PERIODICITY_LABELS,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  TENANT_PLAN_TIER_LABELS,
} from '../../lib/labels';
import type { SubscriptionEntity } from '../../types/entities';
import type {
  BillingPeriodicity,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
  TenantPlanTier,
} from '../../types/enums';
import { formatDateInputValue } from '../../utils/format';

const ALL_TIERS = Object.keys(TENANT_PLAN_TIER_LABELS) as TenantPlanTier[];
const ALL_PERIODICITIES = Object.keys(BILLING_PERIODICITY_LABELS) as BillingPeriodicity[];
const ALL_METHODS = Object.keys(SUBSCRIPTION_PAYMENT_METHOD_LABELS) as SubscriptionPaymentMethod[];
const ALL_STATUSES = Object.keys(SUBSCRIPTION_STATUS_LABELS) as SubscriptionStatus[];

const schema = z.object({
  planTier: z.string().min(1),
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  periodicity: z.string().min(1),
  paymentMethod: z.string().min(1),
  dueDay: z.coerce.number().int().min(1).max(31),
  nextDueDate: z.string().min(1),
  status: z.string().min(1),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Fase 50 -- edicao geral da assinatura, inclusive "alterar vencimento" e
// cancelamento (status = CANCELLED) -- mesmo endpoint (PATCH), nunca uma
// rota separada so para cancelar.
export function EditSubscriptionModal({
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
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (subscription) {
      reset({
        planTier: subscription.planTier,
        amount: subscription.amount,
        periodicity: subscription.periodicity,
        paymentMethod: subscription.paymentMethod,
        dueDay: subscription.dueDay,
        nextDueDate: formatDateInputValue(subscription.nextDueDate),
        status: subscription.status,
        notes: subscription.notes ?? '',
      });
    }
  }, [subscription, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!subscription) throw new Error('Assinatura nao selecionada.');
      return updateSubscription(subscription.id, {
        planTier: values.planTier as TenantPlanTier,
        amount: values.amount,
        periodicity: values.periodicity as BillingPeriodicity,
        paymentMethod: values.paymentMethod as SubscriptionPaymentMethod,
        dueDay: values.dueDay,
        nextDueDate: new Date(values.nextDueDate).toISOString(),
        status: values.status as SubscriptionStatus,
        notes: values.notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Assinatura atualizada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'billing'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível atualizar a assinatura.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={Boolean(subscription)}
      onClose={onClose}
      title="Editar assinatura"
      description={subscription?.tenantName ?? ''}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Status" htmlFor="edit-status" required error={errors.status?.message}>
          <Select id="edit-status" invalid={Boolean(errors.status)} {...register('status')}>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Plano comercial" htmlFor="edit-planTier" required error={errors.planTier?.message}>
          <Select id="edit-planTier" invalid={Boolean(errors.planTier)} {...register('planTier')}>
            {ALL_TIERS.map((t) => (
              <option key={t} value={t}>
                {TENANT_PLAN_TIER_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Valor (R$)" htmlFor="edit-amount" required error={errors.amount?.message}>
          <Input id="edit-amount" type="number" step="0.01" min="0" invalid={Boolean(errors.amount)} {...register('amount')} />
        </FormField>

        <FormField label="Periodicidade" htmlFor="edit-periodicity" required error={errors.periodicity?.message}>
          <Select id="edit-periodicity" invalid={Boolean(errors.periodicity)} {...register('periodicity')}>
            {ALL_PERIODICITIES.map((p) => (
              <option key={p} value={p}>
                {BILLING_PERIODICITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Método de pagamento" htmlFor="edit-paymentMethod" required error={errors.paymentMethod?.message}>
          <Select id="edit-paymentMethod" invalid={Boolean(errors.paymentMethod)} {...register('paymentMethod')}>
            {ALL_METHODS.map((m) => (
              <option key={m} value={m}>
                {SUBSCRIPTION_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Dia do vencimento" htmlFor="edit-dueDay" required error={errors.dueDay?.message} hint="1 a 31">
          <Input id="edit-dueDay" type="number" min="1" max="31" invalid={Boolean(errors.dueDay)} {...register('dueDay')} />
        </FormField>

        <FormField
          label="Próximo vencimento"
          htmlFor="edit-nextDueDate"
          required
          error={errors.nextDueDate?.message}
          hint="Corrige manualmente a data de vencimento"
        >
          <Input id="edit-nextDueDate" type="date" invalid={Boolean(errors.nextDueDate)} {...register('nextDueDate')} />
        </FormField>

        <FormField label="Observações" htmlFor="edit-notes" className="sm:col-span-2" hint="Opcional">
          <Input id="edit-notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
