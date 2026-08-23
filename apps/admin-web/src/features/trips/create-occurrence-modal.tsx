'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { listDrivers } from '../../lib/api/drivers.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listVehicles } from '../../lib/api/fleet.api';
import { createTripOccurrence } from '../../lib/api/trips.api';
import { TRIP_OCCURRENCE_SEVERITY_LABELS, TRIP_OCCURRENCE_TYPE_LABELS } from '../../lib/labels';

const schema = z.object({
  type: z.enum([
    'ACCIDENT',
    'BREAKDOWN',
    'DELAY',
    'ROUTE_DEVIATION',
    'DELIVERY_PROBLEM',
    'DOCUMENT_PROBLEM',
    'VEHICLE_PROBLEM',
    'FUEL_PROBLEM',
    'TIRE_PROBLEM',
    'OTHER',
  ]),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  description: z.string().min(1, 'Descreva a ocorrência.').max(2000),
  occurredAt: z.string().min(1, 'Informe quando aconteceu.'),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateOccurrenceModal({
  open,
  onClose,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
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
    defaultValues: { type: 'OTHER', severity: 'INFO', description: '', occurredAt: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createTripOccurrence(tripId, {
        type: values.type,
        severity: values.severity,
        description: values.description,
        occurredAt: new Date(values.occurredAt).toISOString(),
        driverId: values.driverId || undefined,
        vehicleId: values.vehicleId || undefined,
      }),
    onSuccess: () => {
      toast.success('Ocorrência registrada.');
      queryClient.invalidateQueries({ queryKey: ['trip-occurrences', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'timeline'] });
      handleClose();
    },
    onError: (error) => toast.error('Não foi possível registrar a ocorrência.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ type: 'OTHER', severity: 'INFO', description: '', occurredAt: '' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova ocorrência"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Registrar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Tipo" htmlFor="type" required>
          <Select id="type" {...register('type')}>
            {Object.entries(TRIP_OCCURRENCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Severidade" htmlFor="severity" required>
          <Select id="severity" {...register('severity')}>
            {Object.entries(TRIP_OCCURRENCE_SEVERITY_LABELS).map(([value, label]) => (
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
          <textarea
            id="description"
            className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('description')}
          />
        </FormField>

        <FormField
          label="Quando aconteceu"
          htmlFor="occurredAt"
          required
          error={errors.occurredAt?.message}
        >
          <input
            id="occurredAt"
            type="datetime-local"
            className="h-9 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-ink"
            {...register('occurredAt')}
          />
        </FormField>

        <FormField label="Motorista" htmlFor="driverId" hint="Opcional">
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <EntitySelect
                id="driverId"
                queryKey={['drivers', 'select']}
                queryFn={() => listDrivers({ pageSize: 100 })}
                getOptionValue={(d) => d.id}
                getOptionLabel={(d) => d.name}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
        <FormField label="Veículo" htmlFor="vehicleId" hint="Opcional">
          <Controller
            control={control}
            name="vehicleId"
            render={({ field }) => (
              <EntitySelect
                id="vehicleId"
                queryKey={['vehicles', 'select']}
                queryFn={() => listVehicles({ pageSize: 100 })}
                getOptionValue={(v) => v.id}
                getOptionLabel={(v) => v.plate}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
      </form>
    </Modal>
  );
}
