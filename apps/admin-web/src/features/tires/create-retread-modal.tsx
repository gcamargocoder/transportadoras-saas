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
import { createTireRetread } from '../../lib/api/tires.api';

const schema = z.object({
  company: z.string().min(1, 'Informe a recapadora.'),
  cost: z.coerce.number().positive('Informe o valor da recapagem.'),
  retreadDate: z.string().min(1, 'Informe a data.'),
  warranty: z.string().optional(),
  mileageKm: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateRetreadModal({
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
    mutationFn: (values: FormValues) => createTireRetread(tireId, values),
    onSuccess: () => {
      toast.success('Recapagem registrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['tires'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar a recapagem.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova recapagem"
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
        <FormField label="Recapadora" htmlFor="company" required error={errors.company?.message}>
          <Input id="company" invalid={Boolean(errors.company)} {...register('company')} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Valor (R$)" htmlFor="cost" required error={errors.cost?.message}>
            <Input
              id="cost"
              type="number"
              step="0.01"
              invalid={Boolean(errors.cost)}
              {...register('cost')}
            />
          </FormField>
          <FormField
            label="Data"
            htmlFor="retreadDate"
            required
            error={errors.retreadDate?.message}
          >
            <Input
              id="retreadDate"
              type="date"
              invalid={Boolean(errors.retreadDate)}
              {...register('retreadDate')}
            />
          </FormField>
        </div>
        <FormField label="Garantia" htmlFor="warranty" hint="Opcional">
          <Input id="warranty" {...register('warranty')} placeholder="40.000 km ou 12 meses" />
        </FormField>
        <FormField label="Quilometragem no momento" htmlFor="mileageKm" hint="Opcional">
          <Input id="mileageKm" type="number" {...register('mileageKm')} />
        </FormField>
        <FormField label="Observações" htmlFor="notes" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
