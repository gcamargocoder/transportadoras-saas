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
import { useToast } from '../../components/ui/toast';
import { assignDriverVehicle } from '../../lib/api/drivers.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listVehicles } from '../../lib/api/fleet.api';

const schema = z.object({
  vehicleId: z.string().uuid('Selecione o veículo.'),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function AssignVehicleModal({
  open,
  onClose,
  driverId,
}: {
  open: boolean;
  onClose: () => void;
  driverId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    handleSubmit,
    control,
    register,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => assignDriverVehicle(driverId, values.vehicleId, values.notes || undefined),
    onSuccess: () => {
      toast.success('Veículo vinculado ao motorista.');
      queryClient.invalidateQueries({ queryKey: ['drivers', driverId] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível vincular o veículo.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Vincular veículo"
      description="Se já houver um veículo vinculado, o vínculo atual é encerrado automaticamente (histórico preservado)."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Vincular
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Veículo" htmlFor="assign-vehicle" required error={errors.vehicleId?.message}>
          <Controller
            control={control}
            name="vehicleId"
            render={({ field }) => (
              <EntitySelect
                id="assign-vehicle"
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
        <FormField label="Observações" htmlFor="assign-notes" hint="Opcional">
          <Input id="assign-notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
