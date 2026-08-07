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
import { toFriendlyMessage } from '../../lib/api/errors';
import { listTollPlazas } from '../../lib/api/tolls.api';
import { createTollTransaction } from '../../lib/api/tolls.api';
import { listTrips } from '../../lib/api/trips.api';
import { useToast } from '../../components/ui/toast';
import { tripSelectLabel } from './trip-select-label';

const schema = z.object({
  tripId: z.string().uuid('Selecione a viagem.'),
  tollPlazaId: z.string().uuid('Selecione a praça de pedágio.'),
  axleCount: z.coerce.number().int().positive('Informe a quantidade de eixos.'),
  chargedAmount: z.coerce.number().positive('Informe o valor cobrado.'),
  chargedAt: z.string().min(1, 'Informe a data/hora da cobrança.'),
});

type FormValues = z.infer<typeof schema>;

export function CreateTollModal({
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
      createTollTransaction({
        ...values,
        chargedAt: new Date(values.chargedAt).toISOString(),
        source: 'MANUAL',
      }),
    onSuccess: () => {
      toast.success('Pedágio registrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['toll-transactions'] });
      reset({ tripId: tripId ?? '' });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar o pedágio.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ tripId: tripId ?? '' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Registrar pedágio manual"
      description="Use quando a transação não vier de uma importação de extrato."
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
          label="Praça de pedágio"
          htmlFor="tollPlazaId"
          required
          error={errors.tollPlazaId?.message}
        >
          <Controller
            control={control}
            name="tollPlazaId"
            render={({ field }) => (
              <EntitySelect
                id="tollPlazaId"
                queryKey={['toll-plazas', 'select']}
                queryFn={() => listTollPlazas({ pageSize: 100 })}
                getOptionValue={(p) => p.id}
                getOptionLabel={(p) => `${p.name}${p.highway ? ` · ${p.highway}` : ''}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.tollPlazaId)}
              />
            )}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Quantidade de eixos"
            htmlFor="axleCount"
            required
            error={errors.axleCount?.message}
          >
            <Input
              id="axleCount"
              type="number"
              min={1}
              invalid={Boolean(errors.axleCount)}
              {...register('axleCount')}
            />
          </FormField>
          <FormField
            label="Valor cobrado (R$)"
            htmlFor="chargedAmount"
            required
            error={errors.chargedAmount?.message}
          >
            <Input
              id="chargedAmount"
              type="number"
              step="0.01"
              min={0}
              invalid={Boolean(errors.chargedAmount)}
              {...register('chargedAmount')}
            />
          </FormField>
        </div>

        <FormField
          label="Data/hora da cobrança"
          htmlFor="chargedAt"
          required
          error={errors.chargedAt?.message}
        >
          <Input
            id="chargedAt"
            type="datetime-local"
            invalid={Boolean(errors.chargedAt)}
            {...register('chargedAt')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
