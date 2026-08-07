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
import { createUser } from '../../lib/api/admin.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { ROLE_LABELS } from '../../lib/labels';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'DISPATCHER', 'AUDITOR', 'DRIVER']),
});

type FormValues = z.infer<typeof schema>;

export function CreateUserModal({
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
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { role: 'OPERATOR' } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createUser(values),
    onSuccess: () => {
      toast.success('Usuário cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      reset({ role: 'OPERATOR' });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível cadastrar o usuário.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ role: 'OPERATOR' });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo usuário"
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
        <FormField label="E-mail" htmlFor="email" required error={errors.email?.message}>
          <Input id="email" type="email" invalid={Boolean(errors.email)} {...register('email')} />
        </FormField>
        <FormField
          label="Senha provisória"
          htmlFor="password"
          required
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </FormField>
        <FormField label="Perfil de acesso" htmlFor="role" required>
          <Select id="role" {...register('role')}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Modal>
  );
}
