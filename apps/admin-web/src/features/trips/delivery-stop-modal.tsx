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
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import {
  createTripDeliveryStop,
  listCustomers,
  listLocations,
  updateTripDeliveryStop,
} from '../../lib/api/trips.api';
import type { TripDeliveryStopEntity } from '../../types/entities';

const schema = z.object({
  locationId: z.string().min(1, 'Selecione o local de entrega.'),
  customerId: z.string().optional(),
  plannedArrival: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

const EMPTY_VALUES: FormValues = { locationId: '', customerId: '', plannedArrival: '', notes: '' };

// Fase 88 -- criacao/edicao de uma parada/entrega planejada. Sequencia nunca
// e editada aqui (calculada automaticamente na criacao; reordenar e uma
// acao propria na aba, ver DeliveryStopsTab). Em modo edicao (stop != null),
// so os campos de conteudo mudam -- nenhuma alteracao de sequencia.
export function DeliveryStopModal({
  open,
  onClose,
  tripId,
  stop,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  stop?: TripDeliveryStopEntity | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(stop);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (!open) return;
    if (stop) {
      reset({
        locationId: stop.locationId,
        customerId: stop.customerId ?? '',
        plannedArrival: toDatetimeLocal(stop.plannedArrival),
        notes: stop.notes ?? '',
      });
    } else {
      reset(EMPTY_VALUES);
    }
  }, [open, stop, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const plannedArrival = values.plannedArrival
        ? new Date(values.plannedArrival).toISOString()
        : undefined;
      const notes = values.notes || undefined;
      return stop
        ? updateTripDeliveryStop(tripId, stop.id, {
            locationId: values.locationId,
            customerId: values.customerId || null,
            plannedArrival,
            notes,
          })
        : createTripDeliveryStop(tripId, {
            locationId: values.locationId,
            customerId: values.customerId || undefined,
            plannedArrival,
            notes,
          });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Parada atualizada.' : 'Parada adicionada.');
      queryClient.invalidateQueries({ queryKey: ['trip-delivery-stops', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trip-delivery-stops-eta', tripId] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar a parada.' : 'Não foi possível adicionar a parada.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar parada/entrega' : 'Nova parada/entrega'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            {isEdit ? 'Salvar alterações' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField
          label="Local de entrega"
          htmlFor="delivery-stop-locationId"
          required
          error={errors.locationId?.message}
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="locationId"
            render={({ field }) => (
              <EntitySelect
                id="delivery-stop-locationId"
                queryKey={['locations', 'select']}
                queryFn={() => listLocations({ pageSize: 100 })}
                getOptionValue={(l) => l.id}
                getOptionLabel={(l) => l.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.locationId)}
              />
            )}
          />
        </FormField>

        <FormField
          label="Cliente/destinatário"
          htmlFor="delivery-stop-customerId"
          hint="Opcional — apenas quando já cadastrado"
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="delivery-stop-customerId"
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
          label="Previsão de chegada"
          htmlFor="delivery-stop-plannedArrival"
          hint="Opcional — informada manualmente"
        >
          <Input id="delivery-stop-plannedArrival" type="datetime-local" {...register('plannedArrival')} />
        </FormField>

        <FormField label="Observações" htmlFor="delivery-stop-notes" hint="Opcional">
          <Input id="delivery-stop-notes" {...register('notes')} placeholder="Instruções para a entrega" />
        </FormField>
      </form>
    </Modal>
  );
}
