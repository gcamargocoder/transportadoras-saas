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
import { createTripAdvance } from '../../lib/api/financial.api';
import { listTrips } from '../../lib/api/trips.api';
import { EXPENSE_PAYMENT_METHOD_LABELS } from '../../lib/labels';
import type { ExpensePaymentMethod } from '../../types/enums';
import { tripSelectLabel } from '../tolls/trip-select-label';

const schema = z.object({
  tripId: z.string().uuid('Selecione a viagem.'),
  description: z.string().min(1, 'Informe a descrição.'),
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  paidAt: z.string().min(1, 'Informe a data do pagamento.'),
  paymentMethod: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateAdvanceModal({
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
    defaultValues: { tripId: tripId ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createTripAdvance({
        ...values,
        paidAt: new Date(values.paidAt).toISOString(),
        paymentMethod: values.paymentMethod
          ? (values.paymentMethod as ExpensePaymentMethod)
          : undefined,
      }),
    onSuccess: () => {
      toast.success('Adiantamento registrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['trip-advances'] });
      reset({ tripId: tripId ?? '' });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar o adiantamento.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ tripId: tripId ?? '' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo adiantamento"
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
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        {!tripId && (
          <FormField label="Viagem" htmlFor="tripId" required error={errors.tripId?.message}>
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
        <FormField
          label="Descrição"
          htmlFor="description"
          required
          error={errors.description?.message}
        >
          <Input
            id="description"
            invalid={Boolean(errors.description)}
            {...register('description')}
            placeholder="Adiantamento para despesas de viagem"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
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
            label="Data do pagamento"
            htmlFor="paidAt"
            required
            error={errors.paidAt?.message}
          >
            <Input
              id="paidAt"
              type="date"
              invalid={Boolean(errors.paidAt)}
              {...register('paidAt')}
            />
          </FormField>
        </div>
        <FormField label="Forma de pagamento" htmlFor="paymentMethod" hint="Opcional">
          <Select id="paymentMethod" {...register('paymentMethod')}>
            <option value="">Não informado</option>
            {Object.entries(EXPENSE_PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Modal>
  );
}
