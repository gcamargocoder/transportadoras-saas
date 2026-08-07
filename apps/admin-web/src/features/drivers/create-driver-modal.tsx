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
import { createDriver } from '../../lib/api/drivers.api';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  cpf: z.string().min(11, 'Informe um CPF válido.'),
  cnhNumber: z.string().min(1, 'Informe o número da CNH.'),
  cnhCategory: z.string().min(1, 'Informe a categoria da CNH.'),
  cnhExpiresAt: z.string().min(1, 'Informe o vencimento da CNH.'),
  phone: z.string().optional(),
  email: z.string().email('Informe um e-mail válido.').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export function CreateDriverModal({
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
    mutationFn: (values: FormValues) =>
      createDriver({ ...values, email: values.email || undefined }),
    onSuccess: () => {
      toast.success('Motorista cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível cadastrar o motorista.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo motorista"
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
          label="Nome completo"
          htmlFor="name"
          required
          error={errors.name?.message}
          className="sm:col-span-2"
        >
          <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="CPF" htmlFor="cpf" required error={errors.cpf?.message}>
          <Input
            id="cpf"
            invalid={Boolean(errors.cpf)}
            {...register('cpf')}
            placeholder="000.000.000-00"
          />
        </FormField>
        <FormField label="Telefone" htmlFor="phone" hint="Opcional">
          <Input id="phone" {...register('phone')} />
        </FormField>
        <FormField
          label="Número da CNH"
          htmlFor="cnhNumber"
          required
          error={errors.cnhNumber?.message}
        >
          <Input id="cnhNumber" invalid={Boolean(errors.cnhNumber)} {...register('cnhNumber')} />
        </FormField>
        <FormField
          label="Categoria da CNH"
          htmlFor="cnhCategory"
          required
          error={errors.cnhCategory?.message}
        >
          <Input
            id="cnhCategory"
            invalid={Boolean(errors.cnhCategory)}
            {...register('cnhCategory')}
            placeholder="AE"
          />
        </FormField>
        <FormField
          label="Vencimento da CNH"
          htmlFor="cnhExpiresAt"
          required
          error={errors.cnhExpiresAt?.message}
        >
          <Input
            id="cnhExpiresAt"
            type="date"
            invalid={Boolean(errors.cnhExpiresAt)}
            {...register('cnhExpiresAt')}
          />
        </FormField>
        <FormField label="E-mail" htmlFor="email" error={errors.email?.message} hint="Opcional">
          <Input id="email" type="email" invalid={Boolean(errors.email)} {...register('email')} />
        </FormField>
      </form>
    </Modal>
  );
}
