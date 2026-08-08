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
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { updateTollRoute } from '../../lib/api/toll-routes.api';
import type { TollRouteEntity } from '../../types/entities';

const schema = z.object({
  name: z.string().min(2, 'Informe o nome da rota.'),
  originLabel: z.string().min(2, 'Informe a origem.'),
  destinationLabel: z.string().min(2, 'Informe o destino.'),
});

type FormValues = z.infer<typeof schema>;

export function UpdateRouteModal({
  open,
  onClose,
  route,
}: {
  open: boolean;
  onClose: () => void;
  route: TollRouteEntity;
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
        name: route.name,
        originLabel: route.originLabel,
        destinationLabel: route.destinationLabel,
      });
    }
  }, [open, route, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => updateTollRoute(route.id, values),
    onSuccess: () => {
      toast.success('Rota atualizada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['toll-routes'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível atualizar a rota.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar ${route.name}`}
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
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Nome da rota" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
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
