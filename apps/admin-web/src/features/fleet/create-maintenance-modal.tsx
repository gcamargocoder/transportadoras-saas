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
import { createMaintenance, listVehicles } from '../../lib/api/fleet.api';
import { MAINTENANCE_COMPONENT_LABELS, MAINTENANCE_TYPE_LABELS } from '../../lib/labels';
import type { MaintenanceComponent } from '../../types/enums';

const COMPONENT_VALUES = Object.keys(MAINTENANCE_COMPONENT_LABELS) as [string, ...string[]];

const schema = z.object({
  vehicleId: z.string().uuid('Selecione o veículo.'),
  type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'EMERGENCY', 'OTHER']),
  component: z.enum(COMPONENT_VALUES).optional().or(z.literal('')),
  workshop: z.string().optional(),
  description: z.string().optional(),
  laborCost: z.coerce.number().optional(),
  partsCost: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateMaintenanceModal({
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
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: 'PREVENTIVE' } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createMaintenance({
        ...values,
        component: values.component ? (values.component as MaintenanceComponent) : undefined,
      }),
    onSuccess: () => {
      toast.success('Manutenção registrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar a manutenção.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova manutenção"
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
        <FormField
          label="Veículo"
          htmlFor="vehicleId"
          required
          error={errors.vehicleId?.message}
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="vehicleId"
            render={({ field }) => (
              <EntitySelect
                id="vehicleId"
                queryKey={['vehicles', 'select']}
                queryFn={() => listVehicles({ pageSize: 100 })}
                getOptionValue={(v) => v.id}
                getOptionLabel={(v) => `${v.plate} · ${v.brand} ${v.model}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.vehicleId)}
              />
            )}
          />
        </FormField>
        <FormField label="Tipo" htmlFor="type" required>
          <Select id="type" {...register('type')}>
            {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Componente" htmlFor="component" hint="Opcional">
          <Select id="component" {...register('component')}>
            <option value="">Não informado</option>
            {Object.entries(MAINTENANCE_COMPONENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Oficina" htmlFor="workshop" hint="Opcional">
          <Input id="workshop" {...register('workshop')} />
        </FormField>
        <FormField label="Custo de mão de obra (R$)" htmlFor="laborCost" hint="Opcional">
          <Input id="laborCost" type="number" step="0.01" {...register('laborCost')} />
        </FormField>
        <FormField label="Custo de peças (R$)" htmlFor="partsCost" hint="Opcional">
          <Input id="partsCost" type="number" step="0.01" {...register('partsCost')} />
        </FormField>
        <FormField
          label="Descrição"
          htmlFor="description"
          className="sm:col-span-2"
          hint="Opcional"
        >
          <Input id="description" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
