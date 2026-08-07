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
import { createTrailer } from '../../lib/api/fleet.api';
import { TRAILER_TYPE_LABELS } from '../../lib/labels';

const schema = z.object({
  plate: z.string().min(1, 'Informe a placa.'),
  type: z.enum([
    'SIMPLE',
    'BITREM',
    'RODOTREM',
    'VANDERLEIA',
    'FULL_TRAILER',
    'SEMI_TRAILER',
    'DOLLY',
    'OTHER',
  ]),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateTrailerModal({
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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'SEMI_TRAILER' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createTrailer(values),
    onSuccess: () => {
      toast.success('Carreta cadastrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['trailers'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível cadastrar a carreta.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova carreta"
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
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Placa" htmlFor="plate" required error={errors.plate?.message}>
          <Input id="plate" invalid={Boolean(errors.plate)} {...register('plate')} />
        </FormField>
        <FormField label="Tipo" htmlFor="type" required>
          <Select id="type" {...register('type')}>
            {Object.entries(TRAILER_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Observações" htmlFor="notes" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
