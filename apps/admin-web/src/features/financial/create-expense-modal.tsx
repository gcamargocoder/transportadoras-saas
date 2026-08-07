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
import { createTripExpense } from '../../lib/api/financial.api';
import { listTrips } from '../../lib/api/trips.api';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_PAYMENT_METHOD_LABELS } from '../../lib/labels';
import type { ExpensePaymentMethod } from '../../types/enums';
import { tripSelectLabel } from '../tolls/trip-select-label';

const schema = z.object({
  tripId: z.string().uuid('Selecione a viagem.'),
  category: z.enum([
    'FUEL',
    'FOOD',
    'HOTEL',
    'TOLL_EXTRA',
    'MAINTENANCE',
    'TIRES',
    'PARKING',
    'WASH',
    'ADVANCE',
    'FINE',
    'OTHER',
  ]),
  description: z.string().min(1, 'Informe a descrição.'),
  supplier: z.string().optional(),
  expenseDate: z.string().min(1, 'Informe a data da despesa.'),
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  paymentMethod: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateExpenseModal({
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
    defaultValues: { tripId: tripId ?? '', category: 'FUEL' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createTripExpense({
        ...values,
        expenseDate: new Date(values.expenseDate).toISOString(),
        paymentMethod: values.paymentMethod
          ? (values.paymentMethod as ExpensePaymentMethod)
          : undefined,
      }),
    onSuccess: () => {
      toast.success('Despesa registrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['trip-expenses'] });
      reset({ tripId: tripId ?? '', category: 'FUEL' });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar a despesa.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ tripId: tripId ?? '', category: 'FUEL' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova despesa"
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
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
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

        <FormField label="Fornecedor" htmlFor="supplier" hint="Opcional">
          <Input id="supplier" {...register('supplier')} />
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
          label="Data da despesa"
          htmlFor="expenseDate"
          required
          error={errors.expenseDate?.message}
        >
          <Input
            id="expenseDate"
            type="date"
            invalid={Boolean(errors.expenseDate)}
            {...register('expenseDate')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
