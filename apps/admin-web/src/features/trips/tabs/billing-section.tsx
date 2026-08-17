'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Receipt, Split } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader } from '../../../components/ui/card';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { ErrorState } from '../../../components/ui/error-state';
import { FormField } from '../../../components/ui/form-field';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  cancelTripBilling,
  getTripBilling,
  invoiceTripBilling,
  updateTripBilling,
} from '../../../lib/api/billing-operational.api';
import { TRIP_BILLING_STATUS_LABELS, TRIP_BILLING_STATUS_TONE } from '../../../lib/labels';
import { formatCurrency, formatDateTime } from '../../../utils/format';

const partialSchema = z.object({
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  notes: z.string().optional(),
});
type PartialFormValues = z.infer<typeof partialSchema>;

function PartialInvoiceModal({
  open,
  onClose,
  tripId,
  balance,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  balance: number;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PartialFormValues>({ resolver: zodResolver(partialSchema) });

  const mutation = useMutation({
    mutationFn: (values: PartialFormValues) => invoiceTripBilling(tripId, { amount: values.amount, notes: values.notes || undefined }),
    onSuccess: () => {
      toast.success('Faturamento parcial registrado.');
      queryClient.invalidateQueries({ queryKey: ['billing', 'trip', tripId] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível faturar parcialmente.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Faturar parcialmente"
      description={`Saldo disponível: ${formatCurrency(balance)}. O valor nunca pode ultrapassar o saldo.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Faturar
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Valor (R$)" htmlFor="partial-amount" required error={errors.amount?.message}>
          <Input id="partial-amount" type="number" min={0.01} max={balance} step="0.01" invalid={Boolean(errors.amount)} {...register('amount')} />
        </FormField>
        <FormField label="Observações" htmlFor="partial-notes" hint="Opcional">
          <Input id="partial-notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}

export function BillingSection({ tripId }: { tripId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [partialOpen, setPartialOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const billingQuery = useQuery({
    queryKey: ['billing', 'trip', tripId],
    queryFn: () => getTripBilling(tripId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['billing', 'trip', tripId] });

  const invoiceMutation = useMutation({
    mutationFn: () => invoiceTripBilling(tripId, {}),
    onSuccess: () => {
      toast.success('Viagem faturada.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível faturar.', toFriendlyMessage(error)),
  });

  const paidMutation = useMutation({
    mutationFn: () => updateTripBilling(tripId, { status: 'PAID' }),
    onSuccess: () => {
      toast.success('Faturamento marcado como recebido.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível confirmar o recebimento.', toFriendlyMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelTripBilling(tripId),
    onSuccess: () => {
      toast.success('Faturamento cancelado.');
      invalidate();
      setCancelOpen(false);
    },
    onError: (error) => toast.error('Não foi possível cancelar.', toFriendlyMessage(error)),
  });

  if (billingQuery.isLoading) return <p className="text-sm text-ink-subtle">Carregando faturamento…</p>;
  if (billingQuery.isError || !billingQuery.data) return <ErrorState onRetry={() => billingQuery.refetch()} />;

  const billing = billingQuery.data;
  const hasBalance = (billing.balance ?? 0) > 0;
  const canInvoice = hasBalance && billing.status !== 'CANCELLED' && billing.status !== 'PAID';
  const canMarkPaid = billing.status === 'INVOICED' || billing.status === 'PARTIALLY_INVOICED';
  const canCancel = billing.status !== 'CANCELLED';

  return (
    <Card>
      <CardHeader
        title="Faturamento"
        description="Situação de faturamento/conciliação da viagem — nunca recalcula o valor comercial ao faturar."
        action={<Badge tone={TRIP_BILLING_STATUS_TONE[billing.status]}>{TRIP_BILLING_STATUS_LABELS[billing.status]}</Badge>}
      />
      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <StatCard label="Valor faturável" value={billing.billableAmount !== null ? formatCurrency(billing.billableAmount) : '—'} />
        <StatCard label="Valor faturado" value={formatCurrency(billing.invoicedAmount)} tone="info" />
        <StatCard label="Saldo" value={billing.balance !== null ? formatCurrency(billing.balance) : '—'} tone={hasBalance ? 'warning' : 'success'} />
        <StatCard label="Recebido" value={formatCurrency(billing.receivedAmount)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
        <Button size="sm" onClick={() => invoiceMutation.mutate()} disabled={!canInvoice} loading={invoiceMutation.isPending}>
          <Receipt size={14} />
          Faturar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPartialOpen(true)} disabled={!canInvoice}>
          <Split size={14} />
          Faturar parcialmente
        </Button>
        <Button size="sm" variant="outline" onClick={() => paidMutation.mutate()} disabled={!canMarkPaid} loading={paidMutation.isPending}>
          <CheckCircle2 size={14} />
          Marcar como recebido
        </Button>
        <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)} disabled={!canCancel}>
          <Ban size={14} />
          Cancelar faturamento
        </Button>
      </div>

      {billing.entries.length > 0 && (
        <div className="border-t border-border">
          <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Histórico de faturamentos</p>
          <ul className="divide-y divide-border">
            {billing.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {formatDateTime(entry.createdAt)} · {entry.creatorName ?? '—'}
                  {entry.notes ? ` · ${entry.notes}` : ''}
                </span>
                <span className="shrink-0 font-medium">{formatCurrency(entry.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PartialInvoiceModal open={partialOpen} onClose={() => setPartialOpen(false)} tripId={tripId} balance={billing.balance ?? 0} />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancelar faturamento"
        description="Bloqueia qualquer novo lançamento neste faturamento. As entradas e receitas já geradas são preservadas."
        confirmLabel="Cancelar faturamento"
        danger
        loading={cancelMutation.isPending}
      />
    </Card>
  );
}
