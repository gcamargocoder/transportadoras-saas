'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Unlink } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import {
  getBankTransaction,
  getBankTransactionCandidates,
  reconcileBankTransaction,
  unreconcileBankTransaction,
} from '../../lib/api/bank-reconciliation.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { BANK_RECONCILIATION_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { FINANCIAL_BANK_TRANSACTION_STATUS_LABELS, FINANCIAL_BANK_TRANSACTION_STATUS_TONE, FINANCIAL_TRANSACTION_TYPE_LABELS } from '../../lib/labels';
import { formatCurrency, formatDate } from '../../utils/format';

// Fase 80, secao 12 -- mostra claramente MOVIMENTACAO BANCARIA vs
// TRANSACAO INTERNA lado a lado, para o usuario identificar qualquer
// divergencia visualmente.
export function BankTransactionDetailModal({
  open,
  onClose,
  bankTransactionId,
}: {
  open: boolean;
  onClose: () => void;
  bankTransactionId: string | null;
}): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [unreconcileOpen, setUnreconcileOpen] = useState(false);

  const query = useQuery({
    queryKey: ['bank-transactions', bankTransactionId],
    queryFn: () => getBankTransaction(bankTransactionId as string),
    enabled: Boolean(bankTransactionId),
  });

  const candidatesQuery = useQuery({
    queryKey: ['bank-transactions', bankTransactionId, 'candidates'],
    queryFn: () => getBankTransactionCandidates(bankTransactionId as string),
    enabled: Boolean(bankTransactionId) && query.data?.status === 'PENDING',
  });

  const reconcileMutation = useMutation({
    mutationFn: (financialTransactionId: string) => reconcileBankTransaction(bankTransactionId as string, financialTransactionId),
    onSuccess: (data) => {
      toast.success(
        data.status === 'MATCHED' ? 'Conciliado.' : 'Conciliado com divergência de data.',
        data.status === 'DIVERGENT' ? 'A data da movimentação bancária difere da transação interna.' : undefined,
      );
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
    onError: (error) => toast.error('Não foi possível conciliar.', toFriendlyMessage(error)),
  });

  const unreconcileMutation = useMutation({
    mutationFn: () => unreconcileBankTransaction(bankTransactionId as string),
    onSuccess: () => {
      toast.success('Desconciliado.');
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      setUnreconcileOpen(false);
    },
    onError: (error) => {
      toast.error('Não foi possível desconciliar.', toFriendlyMessage(error));
      setUnreconcileOpen(false);
    },
  });

  const canWrite = hasRole(user?.role, BANK_RECONCILIATION_WRITE_ROLES);
  const bankTransaction = query.data;

  return (
    <>
      <Modal open={open} onClose={onClose} title="Movimentação bancária" size="lg">
        {query.isLoading && <LoadingState label="Carregando movimentação" />}
        {query.isError && <ErrorState onRetry={() => query.refetch()} />}
        {bankTransaction && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{bankTransaction.description}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">{bankTransaction.financialAccountName ?? '—'}</p>
              </div>
              <Badge tone={FINANCIAL_BANK_TRANSACTION_STATUS_TONE[bankTransaction.status]}>
                {FINANCIAL_BANK_TRANSACTION_STATUS_LABELS[bankTransaction.status]}
              </Badge>
            </div>

            {bankTransaction.financialTransaction ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Movimentação bancária</p>
                  <dl className="flex flex-col gap-1.5 text-sm">
                    <Row label="Data" value={formatDate(bankTransaction.date)} />
                    <Row label="Descrição" value={bankTransaction.description} />
                    <Row label="Valor" value={formatCurrency(bankTransaction.amount)} />
                    <Row label="Tipo" value={FINANCIAL_TRANSACTION_TYPE_LABELS[bankTransaction.type]} />
                    <Row label="Conta" value={bankTransaction.financialAccountName ?? '—'} />
                  </dl>
                </div>
                <div className={`rounded-lg border p-3 ${bankTransaction.status === 'DIVERGENT' ? 'border-warning-300 bg-warning-50' : 'border-border'}`}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Transação interna</p>
                  <dl className="flex flex-col gap-1.5 text-sm">
                    <Row
                      label="Data"
                      value={formatDate(bankTransaction.financialTransaction.transactionDate)}
                      highlight={bankTransaction.dateDifferenceDays !== 0}
                    />
                    <Row label="Referência" value={bankTransaction.financialTransaction.description} />
                    <Row label="Valor" value={formatCurrency(bankTransaction.financialTransaction.amount)} />
                    <Row label="Tipo" value={FINANCIAL_TRANSACTION_TYPE_LABELS[bankTransaction.financialTransaction.type]} />
                    <Row label="Conta" value={bankTransaction.financialAccountName ?? '—'} />
                  </dl>
                </div>
                {bankTransaction.status === 'DIVERGENT' && (
                  <p className="sm:col-span-2 text-xs text-warning-700">
                    Divergência de data: {Math.abs(bankTransaction.dateDifferenceDays ?? 0)} dia(s). Valor, tipo e conta batem
                    exatamente -- só a data difere.
                  </p>
                )}
                {canWrite && (
                  <div className="sm:col-span-2 border-t border-border pt-4">
                    <Button size="sm" variant="danger" onClick={() => setUnreconcileOpen(true)}>
                      <Unlink size={14} />
                      Desconciliar
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Row label="Data" value={formatDate(bankTransaction.date)} />
                  <Row label="Valor" value={formatCurrency(bankTransaction.amount)} />
                  <Row label="Tipo" value={FINANCIAL_TRANSACTION_TYPE_LABELS[bankTransaction.type]} />
                  <Row label="Externo" value={bankTransaction.externalId ?? '—'} />
                </dl>

                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Possíveis correspondências</p>
                  {candidatesQuery.isLoading && <LoadingState label="Buscando candidatos" />}
                  {candidatesQuery.data && candidatesQuery.data.length === 0 && (
                    <p className="text-sm text-ink-subtle">Nenhuma transação interna compatível encontrada (mesma conta/tipo/valor).</p>
                  )}
                  {candidatesQuery.data && candidatesQuery.data.length > 0 && (
                    <ul className="divide-y divide-border">
                      {candidatesQuery.data.map((c) => (
                        <li key={c.financialTransaction.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="min-w-0 truncate">
                            {formatDate(c.financialTransaction.transactionDate)} · {c.financialTransaction.description}
                            {!c.exactMatch && (
                              <span className="ml-1.5 text-xs text-warning-700">(data diverge {Math.abs(c.dateDifferenceDays)}d)</span>
                            )}
                            <span className="block font-medium">{formatCurrency(c.financialTransaction.amount)}</span>
                          </span>
                          {canWrite && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reconcileMutation.mutate(c.financialTransaction.id)}
                              loading={reconcileMutation.isPending}
                            >
                              <Link2 size={14} />
                              Conciliar
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={unreconcileOpen}
        onClose={() => setUnreconcileOpen(false)}
        onConfirm={() => unreconcileMutation.mutate()}
        title="Desconciliar movimentação"
        description="Remove somente o vínculo. A movimentação bancária e a transação interna são preservadas -- nada é apagado ou alterado."
        confirmLabel="Desconciliar"
        danger
        loading={unreconcileMutation.isPending}
      />
    </>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className={`font-medium ${highlight ? 'text-warning-700' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}
