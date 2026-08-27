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
import { createCustomerContact, updateCustomerContact } from '../../lib/api/trips.api';
import type { CustomerContactEntity } from '../../types/entities';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome do contato.'),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Informe um e-mail válido.').optional().or(z.literal('')),
  notes: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CustomerContactModal({
  open,
  onClose,
  customerId,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  contact?: CustomerContactEntity | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(contact);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        name: contact?.name ?? '',
        role: contact?.role ?? '',
        phone: contact?.phone ?? '',
        email: contact?.email ?? '',
        notes: contact?.notes ?? '',
        isPrimary: contact?.isPrimary ?? false,
      });
    }
  }, [open, contact, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        name: values.name,
        role: values.role || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        notes: values.notes || undefined,
        isPrimary: values.isPrimary,
      };
      return isEdit && contact ? updateCustomerContact(customerId, contact.id, payload) : createCustomerContact(customerId, payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Contato atualizado.' : 'Contato cadastrado.');
      queryClient.invalidateQueries({ queryKey: ['customers', customerId, 'contacts'] });
      queryClient.invalidateQueries({ queryKey: ['customers', customerId, 'summary'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar o contato.' : 'Não foi possível cadastrar o contato.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar contato' : 'Novo contato'}
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
        <FormField label="Nome" htmlFor="contact-name" required error={errors.name?.message}>
          <Input id="contact-name" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="Cargo/Função" htmlFor="contact-role" hint="Opcional">
          <Input id="contact-role" {...register('role')} />
        </FormField>
        <FormField label="Telefone" htmlFor="contact-phone" hint="Opcional">
          <Input id="contact-phone" {...register('phone')} />
        </FormField>
        <FormField label="E-mail" htmlFor="contact-email" hint="Opcional" error={errors.email?.message}>
          <Input id="contact-email" invalid={Boolean(errors.email)} {...register('email')} />
        </FormField>
        <FormField label="Observações" htmlFor="contact-notes" hint="Opcional">
          <textarea
            id="contact-notes"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 rounded border-border" {...register('isPrimary')} />
          Contato principal
        </label>
      </form>
    </Modal>
  );
}
