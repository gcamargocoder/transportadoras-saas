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
import { createFreightTable, listContracts, updateFreightTable } from '../../lib/api/freight.api';
import { listCustomers } from '../../lib/api/trips.api';
import { FREIGHT_TABLE_STATUS_LABELS, labelOrValue } from '../../lib/labels';
import type { FreightTableEntity } from '../../types/entities';
import { FreightTableStatus } from '../../types/enums';
import { formatDateInputValue } from '../../utils/format';

const schema = z.object({
  customerId: z.string().uuid('Selecione o cliente.'),
  contractId: z.string().optional(),
  name: z.string().min(1, 'Informe o nome da tabela.'),
  code: z.string().min(1, 'Informe o código da tabela.'),
  status: z.nativeEnum(FreightTableStatus).optional(),
  effectiveFrom: z.string().min(1, 'Informe a vigência inicial.'),
  effectiveUntil: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function FreightTableFormModal({
  open,
  onClose,
  table,
  defaultCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  table?: FreightTableEntity | null;
  defaultCustomerId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(table);
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const customerId = watch('customerId');

  useEffect(() => {
    if (open) {
      reset({
        customerId: table?.customerId ?? defaultCustomerId ?? '',
        contractId: table?.contractId ?? '',
        name: table?.name ?? '',
        code: table?.code ?? '',
        status: table?.status,
        effectiveFrom: formatDateInputValue(table?.effectiveFrom) || formatDateInputValue(new Date().toISOString()),
        effectiveUntil: formatDateInputValue(table?.effectiveUntil),
        notes: table?.notes ?? '',
      });
    }
  }, [open, table, defaultCustomerId, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        customerId: values.customerId,
        contractId: values.contractId || undefined,
        name: values.name,
        code: values.code,
        effectiveFrom: new Date(values.effectiveFrom).toISOString(),
        effectiveUntil: values.effectiveUntil ? new Date(values.effectiveUntil).toISOString() : undefined,
        notes: values.notes || undefined,
      };
      return isEdit && table
        ? updateFreightTable(table.id, { ...payload, status: values.status })
        : createFreightTable(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Tabela atualizada.' : 'Tabela criada.');
      queryClient.invalidateQueries({ queryKey: ['freight', 'tables'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar a tabela.' : 'Não foi possível criar a tabela.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar tabela de frete' : 'Nova tabela de frete'}
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
        <FormField label="Cliente" htmlFor="table-customer" required error={errors.customerId?.message}>
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="table-customer"
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
        <FormField label="Contrato" htmlFor="table-contract" hint="Opcional">
          <Controller
            control={control}
            name="contractId"
            render={({ field }) => (
              <EntitySelect
                id="table-contract"
                queryKey={['contracts', 'select', customerId]}
                queryFn={() => listContracts({ pageSize: 100, customerId: customerId || undefined })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.code}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhum"
              />
            )}
          />
        </FormField>
        <FormField label="Nome" htmlFor="table-name" required error={errors.name?.message}>
          <Input id="table-name" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="Código" htmlFor="table-code" required error={errors.code?.message}>
          <Input id="table-code" invalid={Boolean(errors.code)} {...register('code')} />
        </FormField>
        {isEdit && (
          <FormField label="Status" htmlFor="table-status">
            <Select id="table-status" {...register('status')}>
              {(Object.keys(FREIGHT_TABLE_STATUS_LABELS) as FreightTableStatus[]).map((s) => (
                <option key={s} value={s}>
                  {labelOrValue(FREIGHT_TABLE_STATUS_LABELS, s)}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="Vigência inicial" htmlFor="table-from" required error={errors.effectiveFrom?.message}>
          <Input id="table-from" type="date" invalid={Boolean(errors.effectiveFrom)} {...register('effectiveFrom')} />
        </FormField>
        <FormField label="Vigência final" htmlFor="table-until" hint="Opcional">
          <Input id="table-until" type="date" {...register('effectiveUntil')} />
        </FormField>
        <FormField label="Observações" htmlFor="table-notes" className="sm:col-span-2">
          <textarea
            id="table-notes"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
