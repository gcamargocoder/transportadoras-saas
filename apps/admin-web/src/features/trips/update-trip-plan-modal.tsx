'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
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
import { TRIP_PRIORITY_LABELS } from '../../lib/labels';
import { listCustomers, listLocations, updateTrip } from '../../lib/api/trips.api';
import { listTollRoutes } from '../../lib/api/toll-routes.api';
import { listDrivers } from '../../lib/api/drivers.api';
import type { TripEntity } from '../../types/entities';
import { createTripSchema, type CreateTripFormValues } from './create-trip-schema';

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

// Fase 87 -- editar o planejamento (mesmos campos do CreateTripModal,
// mesmo schema reaproveitado) so e permitido enquanto trip.status === PLANNED
// (regra ja existente e inalterada em TripsService.update -- o botao que abre
// este modal so aparece nesse status, ver trips/[id]/page.tsx). As mesmas
// validacoes de disponibilidade de motorista/veiculo do backend (Fase
// 81/86/87) se aplicam aqui, exibidas via toast quando o backend rejeitar
// (409) -- nenhuma checagem de conflito duplicada no frontend.
export function UpdateTripPlanModal({
  open,
  onClose,
  trip,
}: {
  open: boolean;
  onClose: () => void;
  trip: TripEntity;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTripFormValues>({ resolver: zodResolver(createTripSchema) });

  useEffect(() => {
    if (open) {
      reset({
        customerId: trip.customerId ?? '',
        originLocationId: trip.originLocationId,
        destinationLocationId: trip.destinationLocationId,
        driverId: trip.driverId ?? '',
        compositionId: trip.compositionId ?? '',
        tollRouteId: trip.tollRouteId ?? '',
        plannedDeparture: toDatetimeLocal(trip.plannedDeparture),
        plannedArrival: toDatetimeLocal(trip.plannedArrival),
        priority: trip.priority,
        notes: trip.notes ?? '',
      });
    }
  }, [open, trip, reset]);

  const mutation = useMutation({
    mutationFn: (values: CreateTripFormValues) =>
      updateTrip(trip.id, {
        ...values,
        customerId: values.customerId || undefined,
        tollRouteId: values.tollRouteId || null,
        plannedDeparture: new Date(values.plannedDeparture).toISOString(),
        plannedArrival: new Date(values.plannedArrival).toISOString(),
      }),
    onSuccess: () => {
      toast.success('Planejamento atualizado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      onClose();
    },
    onError: (error) => {
      toast.error('Não foi possível atualizar o planejamento.', toFriendlyMessage(error));
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar planejamento"
      description="Alterações permitidas apenas enquanto a viagem está em planejamento (PLANNED)."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Salvar alterações
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField
          label="Origem"
          htmlFor="update-originLocationId"
          required
          error={errors.originLocationId?.message}
        >
          <Controller
            control={control}
            name="originLocationId"
            render={({ field }) => (
              <EntitySelect
                id="update-originLocationId"
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
          htmlFor="update-destinationLocationId"
          required
          error={errors.destinationLocationId?.message}
        >
          <Controller
            control={control}
            name="destinationLocationId"
            render={({ field }) => (
              <EntitySelect
                id="update-destinationLocationId"
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

        <FormField label="Cliente" htmlFor="update-customerId" hint="Opcional">
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="update-customerId"
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
          label="Motorista"
          htmlFor="update-driverId"
          required
          error={errors.driverId?.message}
        >
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <EntitySelect
                id="update-driverId"
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
          htmlFor="update-compositionId"
          required
          error={errors.compositionId?.message}
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="compositionId"
            render={({ field }) => (
              <EntitySelect
                id="update-compositionId"
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
          htmlFor="update-tollRouteId"
          hint="Opcional — define as praças esperadas para a conciliação de pedágio."
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="tollRouteId"
            render={({ field }) => (
              <EntitySelect
                id="update-tollRouteId"
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
          label="Saída prevista"
          htmlFor="update-plannedDeparture"
          required
          error={errors.plannedDeparture?.message}
        >
          <Input
            id="update-plannedDeparture"
            type="datetime-local"
            invalid={Boolean(errors.plannedDeparture)}
            {...register('plannedDeparture')}
          />
        </FormField>

        <FormField
          label="Chegada prevista"
          htmlFor="update-plannedArrival"
          required
          error={errors.plannedArrival?.message}
        >
          <Input
            id="update-plannedArrival"
            type="datetime-local"
            invalid={Boolean(errors.plannedArrival)}
            {...register('plannedArrival')}
          />
        </FormField>

        <FormField label="Prioridade" htmlFor="update-priority">
          <Select id="update-priority" {...register('priority')}>
            {Object.entries(TRIP_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Observações" htmlFor="update-notes" className="sm:col-span-2" hint="Opcional">
          <Input
            id="update-notes"
            {...register('notes')}
            placeholder="Informações adicionais sobre a viagem"
          />
        </FormField>
      </form>
    </Modal>
  );
}
