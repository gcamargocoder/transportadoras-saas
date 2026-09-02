'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { listTripCompositions } from '../../lib/api/fleet.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { TRIP_LOAD_STATUS_LABELS, TRIP_PRIORITY_LABELS } from '../../lib/labels';
import { createTrip, listCustomers, listLocations, listTrips } from '../../lib/api/trips.api';
import { listTollRoutes } from '../../lib/api/toll-routes.api';
import { listDrivers } from '../../lib/api/drivers.api';
import { createTripSchema, type CreateTripFormValues } from './create-trip-schema';

export function CreateTripModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTripFormValues>({
    resolver: zodResolver(createTripSchema),
    defaultValues: { priority: 'NORMAL' },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateTripFormValues) =>
      createTrip({
        ...values,
        customerId: values.customerId || undefined,
        tollRouteId: values.tollRouteId || undefined,
        previousTripId: values.previousTripId || undefined,
        plannedLoadStatus: values.plannedLoadStatus || undefined,
        plannedDeparture: new Date(values.plannedDeparture).toISOString(),
        plannedArrival: new Date(values.plannedArrival).toISOString(),
      }),
    onSuccess: (trip) => {
      toast.success('Viagem criada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      reset();
      onClose();
      router.push(`/trips/${trip.id}`);
    },
    onError: (error) => {
      toast.error('Não foi possível criar a viagem.', toFriendlyMessage(error));
    },
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova viagem"
      description="Preencha os dados para iniciar o planejamento da viagem."
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
            Criar viagem
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField
          label="Origem"
          htmlFor="originLocationId"
          required
          error={errors.originLocationId?.message}
        >
          <Controller
            control={control}
            name="originLocationId"
            render={({ field }) => (
              <EntitySelect
                id="originLocationId"
                queryKey={['locations', 'select']}
                queryFn={() => listLocations({ pageSize: 100 })}
                getOptionValue={(l) => l.id}
                getOptionLabel={(l) => l.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.originLocationId)}
              />
            )}
          />
        </FormField>

        <FormField
          label="Destino"
          htmlFor="destinationLocationId"
          required
          error={errors.destinationLocationId?.message}
        >
          <Controller
            control={control}
            name="destinationLocationId"
            render={({ field }) => (
              <EntitySelect
                id="destinationLocationId"
                queryKey={['locations', 'select']}
                queryFn={() => listLocations({ pageSize: 100 })}
                getOptionValue={(l) => l.id}
                getOptionLabel={(l) => l.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.destinationLocationId)}
              />
            )}
          />
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

        <FormField label="Motorista" htmlFor="driverId" required error={errors.driverId?.message}>
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <EntitySelect
                id="driverId"
                queryKey={['drivers', 'select']}
                queryFn={() => listDrivers({ pageSize: 100, isActive: true })}
                getOptionValue={(d) => d.id}
                getOptionLabel={(d) => d.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.driverId)}
              />
            )}
          />
        </FormField>

        <FormField
          label="Composição (veículo + carretas)"
          htmlFor="compositionId"
          required
          error={errors.compositionId?.message}
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="compositionId"
            render={({ field }) => (
              <EntitySelect
                id="compositionId"
                queryKey={['trip-compositions', 'select']}
                queryFn={() => listTripCompositions({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) =>
                  `${c.vehiclePlate}${c.trailers.length ? ` + ${c.trailers.map((t) => t.trailerPlate).join(', ')}` : ''}`
                }
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.compositionId)}
              />
            )}
          />
        </FormField>

        <FormField
          label="Rota de pedágio"
          htmlFor="tollRouteId"
          hint="Opcional — define as praças esperadas para a conciliação de pedágio."
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="tollRouteId"
            render={({ field }) => (
              <EntitySelect
                id="tollRouteId"
                queryKey={['toll-routes', 'select']}
                queryFn={() => listTollRoutes({ pageSize: 100, isActive: true })}
                getOptionValue={(r) => r.id}
                getOptionLabel={(r) => `${r.name} (${r.originLabel} → ${r.destinationLabel})`}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>

        <FormField
          label="Viagem de origem / viagem anterior"
          htmlFor="previousTripId"
          hint="Opcional — vincule explicitamente esta viagem como o retorno de uma viagem de ida."
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="previousTripId"
            render={({ field }) => (
              <EntitySelect
                id="previousTripId"
                queryKey={['trips', 'select-previous']}
                queryFn={() => listTrips({ pageSize: 100, sortBy: 'createdAt', sortOrder: 'desc' })}
                getOptionValue={(t) => t.id}
                getOptionLabel={(t) => `${t.originName} → ${t.destinationName}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>

        <FormField
          label="Carga planejada"
          htmlFor="plannedLoadStatus"
          hint="Opcional — intenção do planejamento. Não substitui a carga real informada pelo motorista na largada."
        >
          <Select id="plannedLoadStatus" {...register('plannedLoadStatus')}>
            <option value="">Não informado</option>
            {Object.entries(TRIP_LOAD_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Saída prevista"
          htmlFor="plannedDeparture"
          required
          error={errors.plannedDeparture?.message}
        >
          <Input
            id="plannedDeparture"
            type="datetime-local"
            invalid={Boolean(errors.plannedDeparture)}
            {...register('plannedDeparture')}
          />
        </FormField>

        <FormField
          label="Chegada prevista"
          htmlFor="plannedArrival"
          required
          error={errors.plannedArrival?.message}
        >
          <Input
            id="plannedArrival"
            type="datetime-local"
            invalid={Boolean(errors.plannedArrival)}
            {...register('plannedArrival')}
          />
        </FormField>

        <FormField label="Prioridade" htmlFor="priority">
          <Select id="priority" {...register('priority')}>
            {Object.entries(TRIP_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Observações" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <Input
            id="notes"
            {...register('notes')}
            placeholder="Informações adicionais sobre a viagem"
          />
        </FormField>
      </form>
    </Modal>
  );
}
