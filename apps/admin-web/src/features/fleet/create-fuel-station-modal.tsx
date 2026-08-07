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
import { createFuelStation } from '../../lib/api/fuel.api';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome do posto.'),
  cnpj: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateFuelStationModal({
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
    mutationFn: (values: FormValues) => createFuelStation(values),
    onSuccess: () => {
      toast.success('Posto cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['fuel-stations'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível cadastrar o posto.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo posto de combustível"
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
        <FormField label="Nome" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="CNPJ" htmlFor="cnpj" hint="Opcional">
          <Input id="cnpj" {...register('cnpj')} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Cidade" htmlFor="city" hint="Opcional">
            <Input id="city" {...register('city')} />
          </FormField>
          <FormField label="UF" htmlFor="state" hint="Opcional">
            <Input id="state" maxLength={2} {...register('state')} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
