'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { DatePicker } from '../../components/ui/date-picker';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { createFinancialTransfer, listFinancialAccounts } from '../../lib/api/finance-accounts.api';
import { toFriendlyMessage } from '../../lib/api/errors';

// Fase 78 -- transferencia SEMPRE a partir de uma conta de origem fixa (a
// conta cujo detalhe abriu o modal); destino e qualquer OUTRA conta ativa
// do tenant. Nunca tratada como receita/despesa.
export function TransferModal({
  open,
  onClose,
  sourceAccountId,
}: {
  open: boolean;
  onClose: () => void;
  sourceAccountId: string;
}): JSX.Element {
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();

  const accountsQuery = useQuery({
    queryKey: ['finance-accounts', 'list', 'transfer-targets'],
    queryFn: () => listFinancialAccounts({ isActive: true, pageSize: 100 }),
    enabled: open,
  });
  const destinations = (accountsQuery.data?.items ?? []).filter((a) => a.id !== sourceAccountId);

  function reset() {
    setDestinationAccountId('');
    setAmount('');
    setTransactionDate(new Date().toISOString().slice(0, 10));
    setDescription('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      createFinancialTransfer({
        sourceAccountId,
        destinationAccountId,
        amount: Number(amount),
        transactionDate,
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success('Transferência realizada.');
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível transferir.', toFriendlyMessage(error)),
  });

  const valid = Boolean(destinationAccountId) && Number(amount) > 0 && Boolean(transactionDate);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir entre contas"
      description="Cria duas movimentações atômicas: débito na origem, crédito no destino."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid}>
            Transferir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label="Conta de destino" htmlFor="transfer-destination" required>
          <Select id="transfer-destination" value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)}>
            <option value="">Selecione</option>
            {destinations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Valor" htmlFor="transfer-amount" required>
            <Input id="transfer-amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Data" htmlFor="transfer-date" required>
            <DatePicker id="transfer-date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Descrição" htmlFor="transfer-description">
          <Input id="transfer-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
