'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { createTripRevenue } from '../../lib/api/financial.api';
import { listCustomers, listTrips } from '../../lib/api/trips.api';
import { REVENUE_CATEGORY_LABELS } from '../../lib/labels';
import { tripSelectLabel } from '../tolls/trip-select-label';

const schema = z.object({
  tripId: z.string().uuid('Selecione a viagem.'),
  category: z.enum(['FREIGHT', 'BONUS', 'EXTRA_SERVICE', 'INSURANCE', 'OTHER']),
  description: z.string().min(1, 'Informe a descrição.'),
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  receivedAt: z.string().min(1, 'Informe a data de recebimento.'),
  customerId: z.string().optional(),
  invoiceNumber: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateRevenueModal({
  open,
  onClose,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  tripId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tripId: tripId ?? '', category: 'FREIGHT' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createTripRevenue({
        ...values,
        receivedAt: new Date(values.receivedAt).toISOString(),
        customerId: values.customerId || undefined,
      }),
    onSuccess: () => {
      toast.success('Receita registrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['trip-revenues'] });
      reset({ tripId: tripId ?? '', category: 'FREIGHT' });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar a receita.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ tripId: tripId ?? '', category: 'FREIGHT' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova receita"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit((values) => mutation.mutate(values))}
            loading={isSubmitting}
          >
            Registrar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {!tripId && (
          <FormField
            label="Viagem"
            htmlFor="tripId"
            required
            error={errors.tripId?.message}
            className="sm:col-span-2"
          >
            <Controller
              control={control}
              name="tripId"
              render={({ field }) => (
                <EntitySelect
                  id="tripId"
                  queryKey={['trips', 'select']}
                  queryFn={() => listTrips({ pageSize: 100 })}
                  getOptionValue={(t) => t.id}
                  getOptionLabel={tripSelectLabel}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  invalid={Boolean(errors.tripId)}
                />
              )}
            />
          </FormField>
        )}

        <FormField label="Categoria" htmlFor="category" required>
          <Select id="category" {...register('category')}>
            {Object.entries(REVENUE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Cliente" htmlFor="customerId" hint="Opcional">
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="customerId"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhum"
              />
            )}
          />
        </FormField>

        <FormField
          label="Descrição"
          htmlFor="description"
          required
          error={errors.description?.message}
          className="sm:col-span-2"
        >
          <Input
            id="description"
            invalid={Boolean(errors.description)}
            {...register('description')}
          />
        </FormField>

        <FormField label="Valor (R$)" htmlFor="amount" required error={errors.amount?.message}>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min={0}
            invalid={Boolean(errors.amount)}
            {...register('amount')}
          />
        </FormField>
        <FormField
          label="Data de recebimento"
          htmlFor="receivedAt"
          required
          error={errors.receivedAt?.message}
        >
          <Input
            id="receivedAt"
            type="date"
            invalid={Boolean(errors.receivedAt)}
            {...register('receivedAt')}
          />
        </FormField>
        <FormField label="Número da nota fiscal" htmlFor="invoiceNumber" hint="Opcional">
          <Input id="invoiceNumber" {...register('invoiceNumber')} />
        </FormField>
      </form>
    </Modal>
  );
}
