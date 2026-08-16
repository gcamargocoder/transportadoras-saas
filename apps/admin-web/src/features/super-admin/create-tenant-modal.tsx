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
import { createTenant } from '../../lib/api/super-admin.api';

// Mesma regra de complexidade de senha do backend (Fase 46,
// PASSWORD_COMPLEXITY_REGEX) -- validacao no cliente so para feedback
// rapido, o backend continua a autoridade real.
const schema = z.object({
  name: z.string().min(2, 'Informe a razão social.'),
  document: z.string().regex(/^\d{14}$/, 'CNPJ deve conter exatamente 14 dígitos numéricos.'),
  tradeName: z.string().optional(),
  slug: z.string().optional(),
  adminName: z.string().min(2, 'Informe o nome do administrador.'),
  adminEmail: z.string().email('Informe um e-mail válido.'),
  adminPassword: z
    .string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres.')
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'A senha deve conter pelo menos uma letra e um número.'),
});

type FormValues = z.infer<typeof schema>;

export function CreateTenantModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
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
      createTenant({
        name: values.name,
        document: values.document,
        tradeName: values.tradeName || undefined,
        slug: values.slug || undefined,
        admin: { name: values.adminName, email: values.adminEmail, password: values.adminPassword },
      }),
    onSuccess: () => {
      toast.success('Transportadora cadastrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'dashboard'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível cadastrar a transportadora.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova transportadora"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Cadastrar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Razão social" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField label="CNPJ" htmlFor="document" required error={errors.document?.message} hint="Apenas números, 14 dígitos.">
          <Input id="document" invalid={Boolean(errors.document)} {...register('document')} maxLength={14} />
        </FormField>
        <FormField label="Nome fantasia" htmlFor="tradeName" hint="Opcional">
          <Input id="tradeName" {...register('tradeName')} />
        </FormField>
        <FormField label="Identificador (slug)" htmlFor="slug" className="sm:col-span-2" hint="Opcional -- gerado a partir do nome se deixado em branco.">
          <Input id="slug" {...register('slug')} placeholder="minha-transportadora" />
        </FormField>

        <div className="sm:col-span-2 mt-2 border-t border-border pt-4 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Administrador inicial
        </div>
        <FormField label="Nome" htmlFor="adminName" required error={errors.adminName?.message}>
          <Input id="adminName" invalid={Boolean(errors.adminName)} {...register('adminName')} />
        </FormField>
        <FormField label="E-mail" htmlFor="adminEmail" required error={errors.adminEmail?.message}>
          <Input id="adminEmail" type="email" invalid={Boolean(errors.adminEmail)} {...register('adminEmail')} />
        </FormField>
        <FormField
          label="Senha"
          htmlFor="adminPassword"
          required
          error={errors.adminPassword?.message}
          className="sm:col-span-2"
          hint="Mínimo 8 caracteres, com pelo menos 1 letra e 1 número."
        >
          <Input id="adminPassword" type="password" invalid={Boolean(errors.adminPassword)} {...register('adminPassword')} />
        </FormField>
      </form>
    </Modal>
  );
}
