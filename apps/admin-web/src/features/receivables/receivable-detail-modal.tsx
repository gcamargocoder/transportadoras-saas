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
import { cancelReceivable, getReceivable } from '../../lib/api/receivables.api';
import { RECEIVABLE_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { RECEIVABLE_PAYMENT_METHOD_LABELS, RECEIVABLE_STATUS_LABELS, RECEIVABLE_STATUS_TONE } from '../../lib/labels';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { RegisterPaymentModal } from './register-payment-modal';

export function ReceivableDetailModal({
  open,
  onClose,
  receivableId,
}: {
  open: boolean;
  onClose: () => void;
  receivableId: string | null;
}): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const query = useQuery({
    queryKey: ['receivables', receivableId],
    queryFn: () => getReceivable(receivableId as string),
    enabled: Boolean(receivableId),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelReceivable(receivableId as string),
    onSuccess: () => {
      toast.success('Título cancelado.');
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      setCancelOpen(false);
    },
    onError: (error) => toast.error('Não foi possível cancelar o título.', toFriendlyMessage(error)),
  });

  const canWrite = hasRole(user?.role, RECEIVABLE_WRITE_ROLES);
  const receivable = query.data;
  const canPay = receivable && receivable.status !== 'PAID' && receivable.status !== 'CANCELLED';
  const canCancel = receivable && receivable.status !== 'CANCELLED';

  return (
    <>
      <Modal open={open} onClose={onClose} title="Conta a receber" size="lg">
        {query.isLoading && <LoadingState label="Carregando título" />}
        {query.isError && <ErrorState onRetry={() => query.refetch()} />}
        {receivable && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{receivable.description}</p>
                {receivable.tripId ? (
                  <a href={`/trips/${receivable.tripId}`} className="text-xs text-brand-700 hover:underline">
                    {receivable.tripLabel ?? receivable.tripId}
                  </a>
                ) : (
                  <span className="text-xs text-ink-subtle">Título manual — sem viagem vinculada</span>
                )}
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {receivable.customerName ?? 'Sem cliente vinculado'}
                  {receivable.installmentTotal ? ` · Parcela ${receivable.installmentNumber}/${receivable.installmentTotal}` : ''}
                </p>
              </div>
              <Badge tone={RECEIVABLE_STATUS_TONE[receivable.status]}>{RECEIVABLE_STATUS_LABELS[receivable.status]}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-subtle">Valor original</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(receivable.originalAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Recebido</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(receivable.receivedAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Saldo</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(receivable.balance)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">Vencimento</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{formatDate(receivable.dueDate)}</p>
              </div>
            </div>

            {canWrite && (canPay || canCancel) && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {canPay && (
                  <Button size="sm" onClick={() => setPaymentOpen(true)}>
                    <CheckCircle2 size={14} />
                    Registrar recebimento
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
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Histórico de recebimentos</p>
              {!receivable.payments || receivable.payments.length === 0 ? (
                <p className="text-sm text-ink-subtle">Nenhum recebimento registrado ainda.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {receivable.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        {formatDate(p.paymentDate)} · {RECEIVABLE_PAYMENT_METHOD_LABELS[p.paymentMethod]}
                        {p.reference ? ` · ${p.reference}` : ''}
                        <span className="block text-xs text-ink-subtle">
                          {p.creatorName ?? '—'} em {formatDateTime(p.createdAt)}
                        </span>
                        {(p.interestAmount || p.fineAmount || p.discountAmount) && (
                          <span className="mt-0.5 block text-xs text-ink-subtle">
                            {p.interestAmount ? `Juros ${formatCurrency(p.interestAmount)} ` : ''}
                            {p.fineAmount ? `Multa ${formatCurrency(p.fineAmount)} ` : ''}
                            {p.discountAmount ? `Desconto ${formatCurrency(p.discountAmount)}` : ''}
                          </span>
                        )}
                        {/* Fase 79 -- ja vem no MESMO payload (sem consulta extra); nulo so para
                            recebimentos anteriores a esta fase. */}
                        {p.financialAccountId ? (
                          <a
                            href={`/operations/finance/accounts/${p.financialAccountId}`}
                            className="mt-0.5 block text-xs text-brand-700 hover:underline"
                          >
                            {p.financialAccountName ?? 'Conta financeira'}
                          </a>
                        ) : (
                          <span className="mt-0.5 block text-xs text-ink-subtle">Sem conta financeira vinculada</span>
                        )}
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

      {receivable && (
        <RegisterPaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          receivableId={receivable.id}
          balance={receivable.balance}
        />
      )}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancelar título"
        description="Bloqueia novos recebimentos. Pagamentos já registrados são preservados."
        confirmLabel="Cancelar título"
        danger
        loading={cancelMutation.isPending}
      />
    </>
  );
}
