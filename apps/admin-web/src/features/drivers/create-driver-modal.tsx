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
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createDriver, updateDriver } from '../../lib/api/drivers.api';
import { DRIVER_TYPE_LABELS, labelOrValue } from '../../lib/labels';
import type { DriverEntity } from '../../types/entities';
import { DriverType } from '../../types/enums';
import { formatDateInputValue } from '../../utils/format';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  cpf: z.string().min(11, 'Informe um CPF válido.'),
  cnhNumber: z.string().min(1, 'Informe o número da CNH.'),
  cnhCategory: z.string().min(1, 'Informe a categoria da CNH.'),
  cnhExpiresAt: z.string().min(1, 'Informe o vencimento da CNH.'),
  type: z.nativeEnum(DriverType),
  phone: z.string().optional(),
  email: z.string().email('Informe um e-mail válido.').optional().or(z.literal('')),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateDriverModal({
  open,
  onClose,
  driver,
}: {
  open: boolean;
  onClose: () => void;
  driver?: DriverEntity | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(driver);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        name: driver?.name ?? '',
        cpf: driver?.cpf ?? '',
        cnhNumber: driver?.cnhNumber ?? '',
        cnhCategory: driver?.cnhCategory ?? '',
        cnhExpiresAt: formatDateInputValue(driver?.cnhExpiresAt),
        type: driver?.type ?? DriverType.OWN,
        phone: driver?.phone ?? '',
        email: driver?.email ?? '',
        notes: driver?.notes ?? '',
      });
    }
  }, [open, driver, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { ...values, email: values.email || undefined };
      return isEdit && driver ? updateDriver(driver.id, payload) : createDriver(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Motorista atualizado com sucesso.' : 'Motorista cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar o motorista.' : 'Não foi possível cadastrar o motorista.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar motorista' : 'Novo motorista'}
      size="lg"
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
        <FormField label="Classificação" htmlFor="type" required>
          <Select id="type" invalid={Boolean(errors.type)} {...register('type')}>
            {(Object.keys(DRIVER_TYPE_LABELS) as DriverType[]).map((t) => (
              <option key={t} value={t}>
                {labelOrValue(DRIVER_TYPE_LABELS, t)}
              </option>
            ))}
          </Select>
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
        <FormField label="Observações" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <textarea
            id="notes"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
