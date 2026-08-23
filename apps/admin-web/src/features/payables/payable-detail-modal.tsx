'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import { toFriendlyMessage } from '../../lib/api/errors';
import { cancelPayable, getPayable } from '../../lib/api/payables.api';
import { PAYABLE_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_PAYMENT_METHOD_LABELS, PAYABLE_STATUS_LABELS, PAYABLE_STATUS_TONE } from '../../lib/labels';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { PayableRegisterPaymentModal } from './register-payment-modal';

export function PayableDetailModal({
  open,
  onClose,
  payableId,
}: {
  open: boolean;
  onClose: () => void;
  payableId: string | null;
}): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const query = useQuery({
    queryKey: ['payables', payableId],
    queryFn: () => getPayable(payableId as string),
    enabled: Boolean(payableId),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelPayable(payableId as string),
    onSuccess: () => {
      toast.success('Título cancelado.');
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      setCancelOpen(false);
    },
    onError: (error) => toast.error('Não foi possível cancelar o título.', toFriendlyMessage(error)),
  });

  const canWrite = hasRole(user?.role, PAYABLE_WRITE_ROLES);
  const payable = query.data;
  const canPay = payable && payable.status !== 'PAID' && payable.status !== 'CANCELLED';
  const canCancel = payable && payable.status !== 'CANCELLED';

  return (
    <>
      <Modal open={open} onClose={onClose} title="Conta a pagar" size="lg">
        {query.isLoading && <LoadingState label="Carregando título" />}
        {query.isError && <ErrorState onRetry={() => query.refetch()} />}
        {payable && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{payable.description}</p>
                <a href={`/trips/${payable.tripId}`} className="text-xs text-brand-700 hover:underline">
                  {payable.tripLabel ?? payable.tripId}
                </a>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {EXPENSE_CATEGORY_LABELS[payable.category]} · {payable.supplierName ?? 'Sem fornecedor informado'}
                </p>
              </div>
              <Badge tone={PAYABLE_STATUS_TONE[payable.status]}>{PAYABLE_STATUS_LABELS[payable.status]}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-subtle">Valor original</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(payable.originalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Pago</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(payable.paidAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Saldo</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(payable.balance)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Vencimento</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatDate(payable.dueDate)}</p>
              </div>
            </div>

            {canWrite && (canPay || canCancel) && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {canPay && (
                  <Button size="sm" onClick={() => setPaymentOpen(true)}>
                    <CheckCircle2 size={14} />
                    Registrar pagamento
                  </Button>
                )}
                {canCancel && (
                  <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
                    <Ban size={14} />
                    Cancelar título
                  </Button>
                )}
              </div>
            )}

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Histórico de pagamentos</p>
              {!payable.payments || payable.payments.length === 0 ? (
                <p className="text-sm text-ink-subtle">Nenhum pagamento registrado ainda.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {payable.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        {formatDate(p.paymentDate)} · {EXPENSE_PAYMENT_METHOD_LABELS[p.paymentMethod]}
                        {p.reference ? ` · ${p.reference}` : ''}
                        <span className="block text-xs text-ink-subtle">
                          {p.creatorName ?? '—'} em {formatDateTime(p.createdAt)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">{formatCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {payable && (
        <PayableRegisterPaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          payableId={payable.id}
          balance={payable.balance}
        />
      )}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancelar título"
        description="Bloqueia novos pagamentos. Pagamentos já registrados são preservados."
        confirmLabel="Cancelar título"
        danger
        loading={cancelMutation.isPending}
      />
    </>
  );
}
