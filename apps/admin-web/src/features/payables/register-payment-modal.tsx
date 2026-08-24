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
import { toFriendlyMessage } from '../../lib/api/errors';
import { listFinancialAccounts } from '../../lib/api/finance-accounts.api';
import { registerPayablePayment } from '../../lib/api/payables.api';
import { EXPENSE_PAYMENT_METHOD_LABELS } from '../../lib/labels';
import { formatCurrency, formatDate } from '../../utils/format';

const schema = z.object({
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  paymentDate: z.string().min(1, 'Informe a data do pagamento.'),
  paymentMethod: z.enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BANK_TRANSFER', 'COMPANY_ACCOUNT', 'OTHER']),
  // Fase 79 -- sempre obrigatorio, sempre escolhido explicitamente.
  financialAccountId: z.string().min(1, 'Selecione a conta financeira.'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// POST /payables/:id/payments -- o backend e a unica autoridade real sobre
// o limite (nunca ultrapassar o saldo); balance so orienta a UI (max do
// input), nunca substitui a validacao do servidor.
export function PayableRegisterPaymentModal({
  open,
  onClose,
  payableId,
  balance,
}: {
  open: boolean;
  onClose: () => void;
  payableId: string;
  balance: number;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'PIX' },
  });

  // Fase 79, secao 15 -- somente contas ATIVAS do tenant atual.
  const accountsQuery = useQuery({
    queryKey: ['finance-accounts', 'list', 'active-for-select'],
    queryFn: () => listFinancialAccounts({ isActive: true, pageSize: 100 }),
    enabled: open,
  });
  const accounts = accountsQuery.data?.items ?? [];

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      registerPayablePayment(payableId, {
        ...values,
        paymentDate: new Date(values.paymentDate).toISOString(),
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: (_, values) => {
      const accountName = accounts.find((a) => a.id === values.financialAccountId)?.name ?? '';
      toast.success('Pagamento registrado.', `${formatCurrency(values.amount)} · ${accountName} · ${formatDate(values.paymentDate)}`);
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      reset({ paymentMethod: 'PIX' });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível registrar o pagamento.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ paymentMethod: 'PIX' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Registrar pagamento"
      description={`Saldo em aberto: ${balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. O valor nunca pode ultrapassar o saldo.`}
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
        <FormField label="Valor (R$)" htmlFor="payable-payment-amount" required error={errors.amount?.message}>
          <Input
            id="payable-payment-amount"
            type="number"
            step="0.01"
            min={0.01}
            max={balance}
            invalid={Boolean(errors.amount)}
            {...register('amount')}
          />
        </FormField>
        <FormField label="Data do pagamento" htmlFor="payable-payment-date" required error={errors.paymentDate?.message}>
          <Input id="payable-payment-date" type="date" invalid={Boolean(errors.paymentDate)} {...register('paymentDate')} />
        </FormField>
        <FormField label="Forma de pagamento" htmlFor="payable-payment-method" required>
          <Select id="payable-payment-method" {...register('paymentMethod')}>
            {Object.entries(EXPENSE_PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Conta financeira"
          htmlFor="payable-payment-financial-account"
          required
          error={errors.financialAccountId?.message}
          className="sm:col-span-2"
        >
          <Select
            id="payable-payment-financial-account"
            invalid={Boolean(errors.financialAccountId)}
            {...register('financialAccountId')}
          >
            <option value="">Selecione a conta de onde saiu o valor</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Referência" htmlFor="payable-payment-reference" hint="Opcional — número do comprovante/transação">
          <Input id="payable-payment-reference" {...register('reference')} />
        </FormField>
        <FormField label="Observações" htmlFor="payable-payment-notes" hint="Opcional" className="sm:col-span-2">
          <Input id="payable-payment-notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
