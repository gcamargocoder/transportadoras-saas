'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { createFinancialAccount } from '../../lib/api/finance-accounts.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { FINANCIAL_ACCOUNT_TYPE_LABELS } from '../../lib/labels';
import type { FinancialAccountType } from '../../types/enums';

const TYPES: FinancialAccountType[] = ['BANK', 'CASH'];

// Fase 78 -- initialBalance so existe aqui: depois de criada, a conta nunca
// mais permite editar esse campo (ver docs/financial-accounts.md).
export function CreateAccountModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialAccountType>('BANK');
  const [initialBalance, setInitialBalance] = useState('0');
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumberMasked, setAccountNumberMasked] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();

  function reset() {
    setName('');
    setType('BANK');
    setInitialBalance('0');
    setBankName('');
    setBankCode('');
    setAccountNumberMasked('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      createFinancialAccount({
        name,
        type,
        initialBalance: Number(initialBalance) || 0,
        ...(bankName ? { bankName } : {}),
        ...(bankCode ? { bankCode } : {}),
        ...(accountNumberMasked ? { accountNumberMasked } : {}),
      }),
    onSuccess: () => {
      toast.success('Conta financeira cadastrada.');
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível cadastrar a conta.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova conta financeira"
      description="Saldo inicial e tipo não podem ser alterados depois de criada -- correções futuras usam uma movimentação de ajuste."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!name.trim()}>
            Cadastrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label="Nome" htmlFor="account-name" required>
          <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Banco do Brasil - CC" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tipo" htmlFor="account-type" required>
            <Select id="account-type" value={type} onChange={(e) => setType(e.target.value as FinancialAccountType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {FINANCIAL_ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Saldo inicial" htmlFor="account-initial-balance">
            <Input
              id="account-initial-balance"
              type="number"
              step="0.01"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
            />
          </FormField>
        </div>
        {type === 'BANK' && (
          <>
            <FormField label="Banco" htmlFor="account-bank-name">
              <Input id="account-bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Código do banco" htmlFor="account-bank-code">
                <Input id="account-bank-code" value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
              </FormField>
              <FormField label="Conta (mascarada)" htmlFor="account-number-masked">
                <Input
                  id="account-number-masked"
                  value={accountNumberMasked}
                  onChange={(e) => setAccountNumberMasked(e.target.value)}
                  placeholder="****1234"
                />
              </FormField>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
