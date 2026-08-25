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
import { updateMaintenanceProvider } from '../../lib/api/maintenance-providers.api';
import type { MaintenanceProviderEntity } from '../../types/entities';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  tradeName: z.string().optional(),
  document: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido.').optional().or(z.literal('')),
  address: z.string().optional(),
  contactName: z.string().optional(),
  specialties: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// `type` nunca e editavel aqui de proposito -- mesma decisao do backend
// (UpdateMaintenanceProviderDto omite `type`).
export function UpdateProviderModal({
  open,
  onClose,
  provider,
}: {
  open: boolean;
  onClose: () => void;
  provider: MaintenanceProviderEntity;
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
        name: provider.name,
        tradeName: provider.tradeName ?? '',
        document: provider.document ?? '',
        phone: provider.phone ?? '',
        email: provider.email ?? '',
        address: provider.address ?? '',
        contactName: provider.contactName ?? '',
        specialties: provider.specialties ?? '',
        notes: provider.notes ?? '',
      });
    }
  }, [open, provider, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => updateMaintenanceProvider(provider.id, values),
    onSuccess: () => {
      toast.success('Cadastro atualizado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['maintenance-providers'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível atualizar o cadastro.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar cadastro"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Salvar alterações
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Nome / Razão social" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" {...register('name')} />
        </FormField>
        <FormField label="Nome fantasia" htmlFor="tradeName" hint="Opcional">
          <Input id="tradeName" {...register('tradeName')} />
        </FormField>
        <FormField label="CPF/CNPJ" htmlFor="document" hint="Opcional">
          <Input id="document" {...register('document')} />
        </FormField>
        <FormField label="Telefone" htmlFor="phone" hint="Opcional">
          <Input id="phone" {...register('phone')} />
        </FormField>
        <FormField label="E-mail" htmlFor="email" hint="Opcional" error={errors.email?.message}>
          <Input id="email" type="email" {...register('email')} />
        </FormField>
        <FormField label="Contato" htmlFor="contactName" hint="Opcional">
          <Input id="contactName" {...register('contactName')} />
        </FormField>
        <FormField label="Especialidades" htmlFor="specialties" hint="Opcional">
          <Input id="specialties" {...register('specialties')} />
        </FormField>
        <FormField label="Endereço" htmlFor="address" className="sm:col-span-2" hint="Opcional">
          <Input id="address" {...register('address')} />
        </FormField>
        <FormField label="Observações" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
