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
import { createTire } from '../../lib/api/tires.api';

const schema = z.object({
  fireNumber: z.string().min(1, 'Informe o número de fogo.'),
  manufacturer: z.string().min(1, 'Informe o fabricante.'),
  model: z.string().min(1, 'Informe o modelo.'),
  size: z.string().min(1, 'Informe a medida.'),
  dot: z.string().optional(),
  purchasePrice: z.coerce.number().optional(),
  expectedLifespanKm: z.coerce.number().optional(),
  initialTreadDepthMm: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateTireModal({
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
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createTire(values),
    onSuccess: () => {
      toast.success('Pneu cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['tires'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível cadastrar o pneu.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo pneu"
      description="O pneu é cadastrado sempre em estoque."
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
          label="Número de fogo"
          htmlFor="fireNumber"
          required
          error={errors.fireNumber?.message}
        >
          <Input
            id="fireNumber"
            invalid={Boolean(errors.fireNumber)}
            {...register('fireNumber')}
            placeholder="FG-000123"
          />
        </FormField>
        <FormField label="Medida" htmlFor="size" required error={errors.size?.message}>
          <Input
            id="size"
            invalid={Boolean(errors.size)}
            {...register('size')}
            placeholder="295/80R22.5"
          />
        </FormField>
        <FormField
          label="Fabricante"
          htmlFor="manufacturer"
          required
          error={errors.manufacturer?.message}
        >
          <Input
            id="manufacturer"
            invalid={Boolean(errors.manufacturer)}
            {...register('manufacturer')}
          />
        </FormField>
        <FormField label="Modelo" htmlFor="model" required error={errors.model?.message}>
          <Input id="model" invalid={Boolean(errors.model)} {...register('model')} />
        </FormField>
        <FormField label="DOT" htmlFor="dot" hint="Opcional">
          <Input id="dot" {...register('dot')} />
        </FormField>
        <FormField label="Preço de compra (R$)" htmlFor="purchasePrice" hint="Opcional">
          <Input id="purchasePrice" type="number" step="0.01" {...register('purchasePrice')} />
        </FormField>
        <FormField label="Vida útil prevista (km)" htmlFor="expectedLifespanKm" hint="Opcional">
          <Input id="expectedLifespanKm" type="number" {...register('expectedLifespanKm')} />
        </FormField>
        <FormField label="Sulco inicial (mm)" htmlFor="initialTreadDepthMm" hint="Opcional">
          <Input
            id="initialTreadDepthMm"
            type="number"
            step="0.01"
            {...register('initialTreadDepthMm')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
