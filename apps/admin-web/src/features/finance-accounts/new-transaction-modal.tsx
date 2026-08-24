'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { DatePicker } from '../../components/ui/date-picker';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { createFinancialTransaction } from '../../lib/api/finance-accounts.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { FINANCIAL_TRANSACTION_TYPE_LABELS } from '../../lib/labels';
import type { FinancialTransactionType } from '../../types/enums';

const TYPES: FinancialTransactionType[] = ['CREDIT', 'DEBIT'];

// Fase 78 -- movimentacao manual (ajuste de credito/debito). amount sempre
// positivo -- o sentido e definido por type.
export function NewTransactionModal({
  open,
  onClose,
  accountId,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
}): JSX.Element {
  const [type, setType] = useState<FinancialTransactionType>('CREDIT');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();

  function reset() {
    setType('CREDIT');
    setAmount('');
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setDescription('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      createFinancialTransaction(accountId, { type, amount: Number(amount), transactionDate, description: description.trim() }),
    onSuccess: () => {
      toast.success('Movimentação registrada.');
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível registrar a movimentação.', toFriendlyMessage(error)),
  });

  const valid = Number(amount) > 0 && description.trim().length >= 2 && Boolean(transactionDate);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova movimentação"
      description="Ajuste manual de crédito ou débito. Bloqueado se o período financeiro da data informada já estiver fechado."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tipo" htmlFor="tx-type" required>
            <Select id="tx-type" value={type} onChange={(e) => setType(e.target.value as FinancialTransactionType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {FINANCIAL_TRANSACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Valor" htmlFor="tx-amount" required>
            <Input id="tx-amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Data" htmlFor="tx-date" required>
          <DatePicker id="tx-date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
        </FormField>
        <FormField label="Descrição" htmlFor="tx-description" required>
          <Input id="tx-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
