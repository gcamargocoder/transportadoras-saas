'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createVehicle } from '../../lib/api/fleet.api';
import { VEHICLE_FUEL_TYPE_LABELS, VEHICLE_TYPE_LABELS } from '../../lib/labels';
import type { VehicleFuelType } from '../../types/enums';

const schema = z.object({
  plate: z.string().min(7, 'Informe uma placa válida (7 caracteres).').max(10, 'Placa inválida.'),
  brand: z.string().min(1, 'Informe a marca.'),
  model: z.string().min(1, 'Informe o modelo.'),
  type: z.enum(['TRACTOR_UNIT', 'TRUCK', 'VAN', 'PICKUP', 'OTHER']),
  fuelType: z.string().optional(),
  axleCount: z.coerce
    .number()
    .int()
    .optional()
    .refine((v) => v === undefined || v === 0 || v >= 2, {
      message: 'A quantidade de eixos deve ser no mínimo 2 (deixe em branco se não souber).',
    }),
  manufactureYear: z.coerce.number().optional(),
  modelYear: z.coerce.number().optional(),
  odometerKm: z.coerce.number().optional(),
  tankCapacityLiters: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateVehicleModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: 'TRUCK' } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createVehicle({
        ...values,
        fuelType: values.fuelType ? (values.fuelType as VehicleFuelType) : undefined,
        axleCount: values.axleCount ? values.axleCount : undefined,
      }),
    onSuccess: () => {
      toast.success('Veículo cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível cadastrar o veículo.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo veículo"
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
            Cadastrar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField
          label="Placa"
          htmlFor="plate"
          required
          error={errors.plate?.message}
          hint="Identificação principal do veículo — usada em toda a auditoria de pedágio."
        >
          <Input
            id="plate"
            invalid={Boolean(errors.plate)}
            {...register('plate')}
            placeholder="ABC1D23"
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
        <FormField label="Marca" htmlFor="brand" required error={errors.brand?.message}>
          <Input id="brand" invalid={Boolean(errors.brand)} {...register('brand')} />
        </FormField>
        <FormField label="Modelo" htmlFor="model" required error={errors.model?.message}>
          <Input id="model" invalid={Boolean(errors.model)} {...register('model')} />
        </FormField>
        <FormField
          label="Quantidade de eixos do veículo"
          htmlFor="axleCount"
          error={errors.axleCount?.message}
          hint="Eixos físicos do veículo (distinto da configuração de eixos da composição, usada na conferência de pedágio)."
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
        <FormField label="Ano de fabricação" htmlFor="manufactureYear" hint="Opcional">
          <Input id="manufactureYear" type="number" {...register('manufactureYear')} />
        </FormField>
        <FormField label="Ano do modelo" htmlFor="modelYear" hint="Opcional">
          <Input id="modelYear" type="number" {...register('modelYear')} />
        </FormField>
        <FormField label="Odômetro atual (km)" htmlFor="odometerKm" hint="Opcional">
          <Input id="odometerKm" type="number" {...register('odometerKm')} />
        </FormField>
        <FormField label="Capacidade do tanque (L)" htmlFor="tankCapacityLiters" hint="Opcional">
          <Input id="tankCapacityLiters" type="number" {...register('tankCapacityLiters')} />
        </FormField>
        <FormField label="Observações" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
