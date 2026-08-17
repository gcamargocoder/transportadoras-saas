'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createContract, updateContract } from '../../lib/api/freight.api';
import { listCustomers } from '../../lib/api/trips.api';
import { CONTRACT_STATUS_LABELS, labelOrValue } from '../../lib/labels';
import type { ContractEntity } from '../../types/entities';
import { ContractStatus } from '../../types/enums';
import { formatDateInputValue } from '../../utils/format';

const schema = z.object({
  customerId: z.string().uuid('Selecione o cliente.'),
  code: z.string().min(1, 'Informe o código do contrato.'),
  description: z.string().optional(),
  status: z.nativeEnum(ContractStatus).optional(),
  startDate: z.string().min(1, 'Informe a data inicial.'),
  endDate: z.string().optional(),
  notes: z.string().optional(),
  commercialTerms: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ContractFormModal({
  open,
  onClose,
  contract,
  defaultCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  contract?: ContractEntity | null;
  defaultCustomerId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(contract);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        customerId: contract?.customerId ?? defaultCustomerId ?? '',
        code: contract?.code ?? '',
        description: contract?.description ?? '',
        status: contract?.status,
        startDate: formatDateInputValue(contract?.startDate) || formatDateInputValue(new Date().toISOString()),
        endDate: formatDateInputValue(contract?.endDate),
        notes: contract?.notes ?? '',
        commercialTerms: contract?.commercialTerms ?? '',
      });
    }
  }, [open, contract, defaultCustomerId, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        customerId: values.customerId,
        code: values.code,
        description: values.description || undefined,
        startDate: new Date(values.startDate).toISOString(),
        endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
        notes: values.notes || undefined,
        commercialTerms: values.commercialTerms || undefined,
      };
      return isEdit && contract
        ? updateContract(contract.id, { ...payload, status: values.status })
        : createContract(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Contrato atualizado.' : 'Contrato criado.');
      queryClient.invalidateQueries({ queryKey: ['freight', 'contracts'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar o contrato.' : 'Não foi possível criar o contrato.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar contrato' : 'Novo contrato'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            {isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Cliente" htmlFor="contract-customer" required error={errors.customerId?.message}>
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="contract-customer"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={Boolean(defaultCustomerId) || isEdit}
                invalid={Boolean(errors.customerId)}
              />
            )}
          />
        </FormField>
        <FormField label="Código" htmlFor="contract-code" required error={errors.code?.message}>
          <Input id="contract-code" invalid={Boolean(errors.code)} {...register('code')} />
        </FormField>
        {isEdit && (
          <FormField label="Status" htmlFor="contract-status">
            <Select id="contract-status" {...register('status')}>
              {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => (
                <option key={s} value={s}>
                  {labelOrValue(CONTRACT_STATUS_LABELS, s)}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Data inicial" htmlFor="contract-start" required error={errors.startDate?.message}>
          <Input id="contract-start" type="date" invalid={Boolean(errors.startDate)} {...register('startDate')} />
        </FormField>
        <FormField label="Data final" htmlFor="contract-end" hint="Opcional — sem término definido quando vazio">
          <Input id="contract-end" type="date" {...register('endDate')} />
        </FormField>
        <FormField label="Descrição" htmlFor="contract-description" className="sm:col-span-2">
          <Input id="contract-description" {...register('description')} />
        </FormField>
        <FormField
          label="Condições comerciais"
          htmlFor="contract-terms"
          className="sm:col-span-2"
          hint="Prazo de pagamento, reajuste, SLA..."
        >
          <textarea
            id="contract-terms"
            className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('commercialTerms')}
          />
        </FormField>
        <FormField label="Observações" htmlFor="contract-notes" className="sm:col-span-2">
          <textarea
            id="contract-notes"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
