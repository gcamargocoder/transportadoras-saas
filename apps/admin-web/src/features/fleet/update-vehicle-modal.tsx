'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { updateVehicle } from '../../lib/api/fleet.api';
import { VEHICLE_FUEL_TYPE_LABELS, VEHICLE_OWNERSHIP_TYPE_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/labels';
import type { VehicleEntity } from '../../types/entities';
import type { VehicleFuelType } from '../../types/enums';

const schema = z.object({
  plate: z.string().min(7, 'Informe uma placa válida (7 caracteres).').max(10, 'Placa inválida.'),
  brand: z.string().min(1, 'Informe a marca.'),
  model: z.string().min(1, 'Informe o modelo.'),
  type: z.enum(['TRACTOR_UNIT', 'TRUCK', 'VAN', 'PICKUP', 'OTHER']),
  ownershipType: z.enum(['OWN', 'AGGREGATED', 'THIRD_PARTY']),
  fuelType: z.string().optional(),
  axleCount: z.coerce
    .number()
    .int()
    .optional()
    .refine((v) => v === undefined || v === 0 || v >= 2, {
      message: 'A quantidade de eixos deve ser no mínimo 2 (deixe em branco se não souber).',
    }),
  odometerKm: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function UpdateVehicleModal({
  open,
  onClose,
  vehicle,
}: {
  open: boolean;
  onClose: () => void;
  vehicle: VehicleEntity;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        type: vehicle.type,
        ownershipType: vehicle.ownershipType,
        fuelType: vehicle.fuelType ?? '',
        axleCount: vehicle.axleCount ?? undefined,
        odometerKm: vehicle.odometerKm ?? undefined,
        notes: vehicle.notes ?? '',
      });
    }
  }, [open, vehicle, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateVehicle(vehicle.id, {
        ...values,
        fuelType: values.fuelType ? (values.fuelType as VehicleFuelType) : undefined,
        axleCount: values.axleCount ? values.axleCount : undefined,
      }),
    onSuccess: () => {
      toast.success('Veículo atualizado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar o veículo.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar ${vehicle.plate}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit((values) => mutation.mutate(values))}
            loading={isSubmitting}
          >
            Salvar alterações
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Placa" htmlFor="plate" required error={errors.plate?.message}>
          <Input
            id="plate"
            invalid={Boolean(errors.plate)}
            {...register('plate')}
            className="font-mono uppercase tracking-wider"
            maxLength={10}
          />
        </FormField>
        <FormField label="Tipo" htmlFor="type" required>
          <Select id="type" {...register('type')}>
            {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Propriedade" htmlFor="ownershipType" required>
          <Select id="ownershipType" {...register('ownershipType')}>
            {Object.entries(VEHICLE_OWNERSHIP_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Marca" htmlFor="brand" required error={errors.brand?.message}>
          <Input id="brand" invalid={Boolean(errors.brand)} {...register('brand')} />
        </FormField>
        <FormField label="Modelo" htmlFor="model" required error={errors.model?.message}>
          <Input id="model" invalid={Boolean(errors.model)} {...register('model')} />
        </FormField>
        <FormField
          label="Quantidade de eixos"
          htmlFor="axleCount"
          error={errors.axleCount?.message}
          hint="Usada como referência na conferência de pedágio."
        >
          <Input
            id="axleCount"
            type="number"
            min={2}
            invalid={Boolean(errors.axleCount)}
            {...register('axleCount')}
          />
        </FormField>
        <FormField label="Combustível" htmlFor="fuelType" hint="Opcional">
          <Select id="fuelType" {...register('fuelType')}>
            <option value="">Não informado</option>
            {Object.entries(VEHICLE_FUEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Odômetro atual (km)" htmlFor="odometerKm" hint="Opcional">
          <Input id="odometerKm" type="number" {...register('odometerKm')} />
        </FormField>
        <FormField label="Observações" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
