'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createTollRoute } from '../../lib/api/toll-routes.api';

const schema = z.object({
  name: z.string().min(2, 'Informe o nome da rota.'),
  originLabel: z.string().min(2, 'Informe a origem.'),
  destinationLabel: z.string().min(2, 'Informe o destino.'),
});

type FormValues = z.infer<typeof schema>;

// Rota nasce sem paradas -- pracas sao adicionadas na tela de detalhe
// (PUT /toll-routes/:id/stops), por isso o formulario de criacao so pede
// nome + origem + destino.
export function CreateRouteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createTollRoute(values),
    onSuccess: (route) => {
      toast.success('Rota de pedágio criada. Agora adicione as praças esperadas.');
      queryClient.invalidateQueries({ queryKey: ['toll-routes'] });
      reset();
      onClose();
      router.push(`/toll-routes/${route.id}`);
    },
    onError: (error) => toast.error('Não foi possível criar a rota.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova rota de pedágio"
      description="Corredor operacional (ex: 'São José do Rio Preto → São Paulo'). As praças esperadas são adicionadas em seguida."
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit((values) => mutation.mutate(values))}
            loading={isSubmitting}
          >
            Criar rota
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Nome da rota" htmlFor="name" required error={errors.name?.message}>
          <Input
            id="name"
            invalid={Boolean(errors.name)}
            placeholder="São José do Rio Preto → São Paulo"
            {...register('name')}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Origem"
            htmlFor="originLabel"
            required
            error={errors.originLabel?.message}
          >
            <Input
              id="originLabel"
              invalid={Boolean(errors.originLabel)}
              {...register('originLabel')}
            />
          </FormField>
          <FormField
            label="Destino"
            htmlFor="destinationLabel"
            required
            error={errors.destinationLabel?.message}
          >
            <Input
              id="destinationLabel"
              invalid={Boolean(errors.destinationLabel)}
              {...register('destinationLabel')}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
