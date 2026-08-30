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
import { listMaintenances, listTrailers, listVehicles } from '../../lib/api/fleet.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createTireMovement } from '../../lib/api/tires.api';
import { MAINTENANCE_STATUS_LABELS } from '../../lib/labels';

const schema = z
  .object({
    locationType: z.enum(['STOCK', 'VEHICLE', 'TRAILER']),
    vehicleId: z.string().optional(),
    trailerId: z.string().optional(),
    position: z.string().optional(),
    odometerKm: z.coerce.number().optional(),
    reason: z.string().optional(),
    maintenanceId: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.locationType === 'VEHICLE' && !values.vehicleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vehicleId'],
        message: 'Selecione o veículo.',
      });
    }
    if (values.locationType === 'TRAILER' && !values.trailerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trailerId'],
        message: 'Selecione a carreta.',
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export function CreateMovementModal({
  open,
  onClose,
  tireId,
}: {
  open: boolean;
  onClose: () => void;
  tireId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { locationType: 'STOCK' },
  });

  const locationType = watch('locationType');

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createTireMovement(tireId, {
        newLocationType: values.locationType,
        newVehicleId: values.locationType === 'VEHICLE' ? values.vehicleId : undefined,
        newTrailerId: values.locationType === 'TRAILER' ? values.trailerId : undefined,
        newPosition: values.position,
        odometerKm: values.odometerKm,
        reason: values.reason,
        maintenanceId: values.maintenanceId || undefined,
      }),
    onSuccess: () => {
      toast.success('Movimentação registrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['tires'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      reset({ locationType: 'STOCK' });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar a movimentação.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ locationType: 'STOCK' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova movimentação"
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
        <FormField label="Novo destino" htmlFor="locationType" required>
          <Select id="locationType" {...register('locationType')}>
            <option value="STOCK">Estoque</option>
            <option value="VEHICLE">Veículo</option>
            <option value="TRAILER">Carreta</option>
          </Select>
        </FormField>

        {locationType === 'VEHICLE' && (
          <FormField label="Veículo" htmlFor="vehicleId" required error={errors.vehicleId?.message}>
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
                  invalid={Boolean(errors.vehicleId)}
                />
              )}
            />
          </FormField>
        )}

        {locationType === 'TRAILER' && (
          <FormField label="Carreta" htmlFor="trailerId" required error={errors.trailerId?.message}>
            <Controller
              control={control}
              name="trailerId"
              render={({ field }) => (
                <EntitySelect
                  id="trailerId"
                  queryKey={['trailers', 'select']}
                  queryFn={() => listTrailers({ pageSize: 100 })}
                  getOptionValue={(t) => t.id}
                  getOptionLabel={(t) => t.plate}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  invalid={Boolean(errors.trailerId)}
                />
              )}
            />
          </FormField>
        )}

        {locationType !== 'STOCK' && (
          <FormField label="Posição" htmlFor="position" hint="Ex: Dianteiro Esquerdo, Tração 1">
            <Input id="position" {...register('position')} />
          </FormField>
        )}

        <FormField label="Odômetro (km)" htmlFor="odometerKm" hint="Opcional">
          <Input id="odometerKm" type="number" {...register('odometerKm')} />
        </FormField>
        <FormField label="Motivo" htmlFor="reason" hint="Opcional">
          <Input id="reason" {...register('reason')} />
        </FormField>
        <FormField
          label="Ordem de serviço"
          htmlFor="maintenanceId"
          hint="Opcional -- vincula esta troca a uma OS já registrada."
        >
          <Controller
            control={control}
            name="maintenanceId"
            render={({ field }) => (
              <EntitySelect
                id="maintenanceId"
                queryKey={['maintenances', 'select', locationType === 'VEHICLE' ? watch('vehicleId') : undefined]}
                queryFn={() =>
                  listMaintenances({
                    vehicleId: locationType === 'VEHICLE' ? watch('vehicleId') || undefined : undefined,
                    pageSize: 50,
                  })
                }
                getOptionValue={(m) => m.id}
                getOptionLabel={(m) =>
                  `${m.serviceOrderNumber ?? `OS ${m.id.slice(0, 8)}`} · ${m.vehiclePlate ?? '—'} · ${MAINTENANCE_STATUS_LABELS[m.status]}`
                }
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>
      </form>
    </Modal>
  );
}
