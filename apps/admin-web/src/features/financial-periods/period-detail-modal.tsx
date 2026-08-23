'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
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
import { closeFinancialPeriod, getFinancialPeriod } from '../../lib/api/financial-periods.api';
import { FINANCIAL_PERIOD_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import {
  FINANCE_AUDIT_ACTION_LABELS,
  FINANCIAL_PERIOD_STATUS_LABELS,
  FINANCIAL_PERIOD_STATUS_TONE,
  MONTH_LABELS,
} from '../../lib/labels';
import { formatCurrency, formatDateTime } from '../../utils/format';

export function PeriodDetailModal({
  open,
  onClose,
  periodId,
}: {
  open: boolean;
  onClose: () => void;
  periodId: string | null;
}): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [closeOpen, setCloseOpen] = useState(false);

  const query = useQuery({
    queryKey: ['financial-periods', periodId],
    queryFn: () => getFinancialPeriod(periodId as string),
    enabled: Boolean(periodId),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeFinancialPeriod(periodId as string),
    onSuccess: () => {
      toast.success('Período financeiro fechado.');
      queryClient.invalidateQueries({ queryKey: ['financial-periods'] });
      setCloseOpen(false);
    },
    onError: (error) => {
      toast.error('Não foi possível fechar o período.', toFriendlyMessage(error));
      setCloseOpen(false);
    },
  });

  const canWrite = hasRole(user?.role, FINANCIAL_PERIOD_WRITE_ROLES);
  const period = query.data;
  const canClose = period && period.status === 'OPEN';

  return (
    <>
      <Modal open={open} onClose={onClose} title="Período financeiro" size="lg">
        {query.isLoading && <LoadingState label="Carregando período" />}
        {query.isError && <ErrorState onRetry={() => query.refetch()} />}
        {period && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {MONTH_LABELS[period.month]} de {period.year}
                </p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  Aberto por {period.openerName ?? '—'} em {formatDateTime(period.openedAt)}
                  {period.closedAt && (
                    <>
                      {' '}
                      · Fechado por {period.closerName ?? '—'} em {formatDateTime(period.closedAt)}
                    </>
                  )}
                </p>
              </div>
              <Badge tone={FINANCIAL_PERIOD_STATUS_TONE[period.status]}>
                {FINANCIAL_PERIOD_STATUS_LABELS[period.status]}
              </Badge>
            </div>

            {period.summary && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-ink-subtle">Recebido</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(period.summary.totalReceived)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">Pago</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(period.summary.totalPaid)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">Contas a receber (aberto)</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(period.summary.receivableOpen)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">Contas a pagar (aberto)</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{formatCurrency(period.summary.payableOpen)}</p>
                </div>
              </div>
            )}

            {period.summary && (
              <div
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  period.summary.criticalReconciliationIssues > 0
                    ? 'border-danger-200 bg-danger-50 text-danger-700'
                    : 'border-border bg-surface-muted text-ink-muted'
                }`}
              >
                {period.summary.criticalReconciliationIssues > 0
                  ? `${period.summary.criticalReconciliationIssues} inconsistência(s) CRÍTICA(s) na conciliação financeira -- impede o fechamento.`
                  : 'Nenhuma inconsistência CRÍTICA detectada na conciliação financeira deste período.'}
              </div>
            )}

            {period.auditHistory && period.auditHistory.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Histórico de auditoria</p>
                <ul className="divide-y divide-border">
                  {period.auditHistory.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>{FINANCE_AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</span>
                      <span className="shrink-0 text-xs text-ink-subtle">{formatDateTime(entry.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {period.status === 'CLOSED' && (
              <p className="text-xs text-ink-subtle">
                Período fechado -- novas mutações financeiras com competência neste mês são bloqueadas. Reabertura não é
                suportada nesta fase.
              </p>
            )}

            {canWrite && canClose && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" variant="danger" onClick={() => setCloseOpen(true)}>
                  <Lock size={14} />
                  Fechar período
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={() => closeMutation.mutate()}
        title="Fechar período financeiro"
        description="Bloqueia novos lançamentos (pagamentos, recebimentos, criação/cancelamento de títulos) com competência neste mês. Não altera nem apaga nenhum dado histórico, e não pode ser desfeito nesta fase."
        confirmLabel="Fechar período"
        danger
        loading={closeMutation.isPending}
      />
    </>
  );
}
