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
import { createTireInspection } from '../../lib/api/tires.api';

const schema = z.object({
  inspectionDate: z.string().min(1, 'Informe a data.'),
  treadDepthMm: z.coerce.number().nonnegative('Informe o sulco medido.'),
  pressurePsi: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateInspectionModal({
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
    mutationFn: (values: FormValues) => createTireInspection(tireId, values),
    onSuccess: () => {
      toast.success('Inspeção registrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['tires'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar a inspeção.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova inspeção"
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Data"
            htmlFor="inspectionDate"
            required
            error={errors.inspectionDate?.message}
          >
            <Input
              id="inspectionDate"
              type="date"
              invalid={Boolean(errors.inspectionDate)}
              {...register('inspectionDate')}
            />
          </FormField>
          <FormField
            label="Sulco (mm)"
            htmlFor="treadDepthMm"
            required
            error={errors.treadDepthMm?.message}
          >
            <Input
              id="treadDepthMm"
              type="number"
              step="0.01"
              invalid={Boolean(errors.treadDepthMm)}
              {...register('treadDepthMm')}
            />
          </FormField>
        </div>
        <FormField label="Pressão (PSI)" htmlFor="pressurePsi" hint="Opcional">
          <Input id="pressurePsi" type="number" step="0.1" {...register('pressurePsi')} />
        </FormField>
        <FormField label="Observações" htmlFor="notes" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
