'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createTireDisposal } from '../../lib/api/tires.api';

const schema = z.object({
  reason: z.string().min(1, 'Informe o motivo do descarte.'),
  disposalDate: z.string().min(1, 'Informe a data.'),
  odometerKm: z.coerce.number().optional(),
  residualValue: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateDisposalModal({
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
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createTireDisposal(tireId, values),
    onSuccess: () => {
      toast.success('Descarte registrado. O pneu foi marcado como sucateado.');
      queryClient.invalidateQueries({ queryKey: ['tires'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar o descarte.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Descartar pneu"
      description="Essa ação marca o pneu como sucateado e bloqueia novas movimentações."
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit((values) => mutation.mutate(values))}
            loading={isSubmitting}
          >
            Descartar
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Motivo" htmlFor="reason" required error={errors.reason?.message}>
          <Input
            id="reason"
            invalid={Boolean(errors.reason)}
            {...register('reason')}
            placeholder="Desgaste irreparável abaixo do limite legal"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Data"
            htmlFor="disposalDate"
            required
            error={errors.disposalDate?.message}
          >
            <Input
              id="disposalDate"
              type="date"
              invalid={Boolean(errors.disposalDate)}
              {...register('disposalDate')}
            />
          </FormField>
          <FormField label="Odômetro (km)" htmlFor="odometerKm" hint="Opcional">
            <Input id="odometerKm" type="number" {...register('odometerKm')} />
          </FormField>
        </div>
        <FormField label="Valor residual (R$)" htmlFor="residualValue" hint="Opcional">
          <Input id="residualValue" type="number" step="0.01" {...register('residualValue')} />
        </FormField>
      </form>
    </Modal>
  );
}
