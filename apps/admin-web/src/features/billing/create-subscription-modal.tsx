'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { createSubscription } from '../../lib/api/billing.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listTenants } from '../../lib/api/super-admin.api';
import {
  BILLING_PERIODICITY_LABELS,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  TENANT_PLAN_TIER_LABELS,
} from '../../lib/labels';
import type { BillingPeriodicity, SubscriptionPaymentMethod, TenantPlanTier } from '../../types/enums';

const ALL_TIERS = Object.keys(TENANT_PLAN_TIER_LABELS) as TenantPlanTier[];
const ALL_PERIODICITIES = Object.keys(BILLING_PERIODICITY_LABELS) as BillingPeriodicity[];
const ALL_METHODS = Object.keys(SUBSCRIPTION_PAYMENT_METHOD_LABELS) as SubscriptionPaymentMethod[];

const schema = z.object({
  tenantId: z.string().uuid('Selecione a transportadora.'),
  planTier: z.string().min(1),
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  periodicity: z.string().min(1),
  paymentMethod: z.string().min(1),
  startDate: z.string().min(1, 'Informe a data de início.'),
  dueDay: z.coerce.number().int().min(1).max(31),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Fase 50 -- reaproveitado tanto pelo botao "Nova assinatura" da listagem
// (/super-admin/billing, sem tenant pre-definido -- mostra o seletor) quanto
// pela secao "Assinatura e cobranca" do detalhe do tenant (tenantId/
// tenantName ja conhecidos -- esconde o seletor).
export function CreateSubscriptionModal({
  open,
  onClose,
  tenantId,
  tenantName,
}: {
  open: boolean;
  onClose: () => void;
  tenantId?: string;
  tenantName?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();

  const tenantsQuery = useQuery({
    queryKey: ['super-admin', 'tenants', 'picker'],
    queryFn: ({ signal }) => listTenants({ pageSize: 100, sortBy: 'name', sortOrder: 'asc' }, signal),
    enabled: open && !tenantId,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tenantId: tenantId ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createSubscription({
        tenantId: values.tenantId,
        planTier: values.planTier as TenantPlanTier,
        amount: values.amount,
        periodicity: values.periodicity as BillingPeriodicity,
        paymentMethod: values.paymentMethod as SubscriptionPaymentMethod,
        startDate: new Date(values.startDate).toISOString(),
        dueDay: values.dueDay,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Assinatura criada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'billing'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível criar a assinatura.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nova assinatura" size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Criar assinatura
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {tenantId ? (
          <FormField label="Transportadora" htmlFor="tenantId-display" className="sm:col-span-2">
            <Input id="tenantId-display" value={tenantName ?? tenantId} disabled />
          </FormField>
        ) : (
          <FormField
            label="Transportadora"
            htmlFor="tenantId"
            required
            error={errors.tenantId?.message}
            className="sm:col-span-2"
          >
            <Select id="tenantId" invalid={Boolean(errors.tenantId)} {...register('tenantId')}>
              <option value="">Selecione...</option>
              {tenantsQuery.data?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Plano comercial" htmlFor="planTier" required error={errors.planTier?.message}>
          <Select id="planTier" invalid={Boolean(errors.planTier)} {...register('planTier')}>
            <option value="">Selecione...</option>
            {ALL_TIERS.map((t) => (
              <option key={t} value={t}>
                {TENANT_PLAN_TIER_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Valor (R$)" htmlFor="amount" required error={errors.amount?.message}>
          <Input id="amount" type="number" step="0.01" min="0" invalid={Boolean(errors.amount)} {...register('amount')} />
        </FormField>

        <FormField label="Periodicidade" htmlFor="periodicity" required error={errors.periodicity?.message}>
          <Select id="periodicity" invalid={Boolean(errors.periodicity)} {...register('periodicity')}>
            <option value="">Selecione...</option>
            {ALL_PERIODICITIES.map((p) => (
              <option key={p} value={p}>
                {BILLING_PERIODICITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Método de pagamento" htmlFor="paymentMethod" required error={errors.paymentMethod?.message}>
          <Select id="paymentMethod" invalid={Boolean(errors.paymentMethod)} {...register('paymentMethod')}>
            <option value="">Selecione...</option>
            {ALL_METHODS.map((m) => (
              <option key={m} value={m}>
                {SUBSCRIPTION_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Data de início" htmlFor="startDate" required error={errors.startDate?.message}>
          <Input id="startDate" type="date" invalid={Boolean(errors.startDate)} {...register('startDate')} />
        </FormField>

        <FormField
          label="Dia do vencimento"
          htmlFor="dueDay"
          required
          error={errors.dueDay?.message}
          hint="1 a 31"
        >
          <Input id="dueDay" type="number" min="1" max="31" invalid={Boolean(errors.dueDay)} {...register('dueDay')} />
        </FormField>

        <FormField label="Observações" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
