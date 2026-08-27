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
import { createCustomer, updateCustomer } from '../../lib/api/trips.api';
import type { CustomerEntity } from '../../types/entities';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome do cliente.'),
  document: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Informe um e-mail válido.').optional().or(z.literal('')),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Fase 93 -- evoluido de "criar cliente" para criar/editar (CRM): mesmo
// formulario, PATCH reaproveita a validacao ja existente em vez de duplicar
// logica de escrita (padrao ja usado por ContractFormModal).
export function CustomerFormModal({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer?: CustomerEntity | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(customer);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        name: customer?.name ?? '',
        document: customer?.document ?? '',
        phone: customer?.phone ?? '',
        email: customer?.email ?? '',
        address: customer?.address ?? '',
      });
    }
  }, [open, customer, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        name: values.name,
        document: values.document || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
      };
      return isEdit && customer ? updateCustomer(customer.id, payload) : createCustomer(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar o cliente.' : 'Não foi possível cadastrar o cliente.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar cliente' : 'Novo cliente'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            {isEdit ? 'Salvar' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Nome" htmlFor="customer-name" required error={errors.name?.message}>
          <Input id="customer-name" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="CNPJ/CPF" htmlFor="customer-document" hint="Opcional">
          <Input id="customer-document" {...register('document')} />
        </FormField>
        <FormField label="Telefone" htmlFor="customer-phone" hint="Opcional">
          <Input id="customer-phone" {...register('phone')} />
        </FormField>
        <FormField label="E-mail" htmlFor="customer-email" hint="Opcional" error={errors.email?.message}>
          <Input id="customer-email" invalid={Boolean(errors.email)} {...register('email')} />
        </FormField>
        <FormField label="Endereço" htmlFor="customer-address" hint="Opcional">
          <Input id="customer-address" {...register('address')} />
        </FormField>
      </form>
    </Modal>
  );
}
