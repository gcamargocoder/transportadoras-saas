'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createFinancialPeriod } from '../../lib/api/financial-periods.api';
import { MONTH_LABELS } from '../../lib/labels';

const MONTHS = Object.keys(MONTH_LABELS).map(Number);

export function CreatePeriodModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: () => createFinancialPeriod({ year, month }),
    onSuccess: () => {
      toast.success('Período financeiro aberto.');
      queryClient.invalidateQueries({ queryKey: ['financial-periods'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível abrir o período.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Abrir período financeiro"
      description="Cria uma janela mensal (OPEN) para controle de fechamento -- não altera nenhum dado financeiro existente."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Abrir período
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ano" htmlFor="period-year" required>
          <Input
            id="period-year"
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </FormField>
        <FormField label="Mês" htmlFor="period-month" required>
          <Select id="period-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {MONTH_LABELS[m]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
    </Modal>
  );
}
