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
import { toFriendlyMessage } from '../../lib/api/errors';
import { createFuelTank } from '../../lib/api/fuel-tanks.api';
import { FUEL_TYPE_LABELS } from '../../lib/labels';
import { FuelType } from '../../types/enums';

const schema = z
  .object({
    name: z.string().min(1, 'Informe o nome.'),
    fuelType: z.string().optional(),
    capacityLiters: z.coerce.number().positive('capacityLiters deve ser maior que zero.'),
    initialStockLiters: z.coerce.number().min(0, 'initialStockLiters não pode ser negativo.'),
    minStockLiters: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
    location: z.string().optional(),
  })
  .refine((v) => v.initialStockLiters <= v.capacityLiters, {
    message: 'O estoque inicial não pode ser maior que a capacidade.',
    path: ['initialStockLiters'],
  })
  .refine((v) => v.minStockLiters === '' || v.minStockLiters === undefined || v.minStockLiters <= v.capacityLiters, {
    message: 'O estoque mínimo não pode ser maior que a capacidade.',
    path: ['minStockLiters'],
  });

type FormValues = z.infer<typeof schema>;

export function CreateFuelTankModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
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
      createFuelTank({
        name: values.name,
        fuelType: (values.fuelType || undefined) as FuelType | undefined,
        capacityLiters: values.capacityLiters,
        initialStockLiters: values.initialStockLiters,
        minStockLiters: values.minStockLiters === '' || values.minStockLiters === undefined ? undefined : values.minStockLiters,
        location: values.location || undefined,
      }),
    onSuccess: () => {
      toast.success('Tanque cadastrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível cadastrar o tanque.', toFriendlyMessage(error)),
  });

  function handleClose(): void {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo tanque"
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
        <FormField label="Nome" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="name" {...register('name')} placeholder="Tanque matriz -- pátio central" />
        </FormField>
        <FormField label="Combustível" htmlFor="fuelType" hint="Padrão: Diesel S10">
          <Select id="fuelType" {...register('fuelType')}>
            <option value="">{FUEL_TYPE_LABELS[FuelType.DIESEL_S10]}</option>
            {Object.values(FuelType)
              .filter((t) => t !== FuelType.DIESEL_S10)
              .map((t) => (
                <option key={t} value={t}>
                  {FUEL_TYPE_LABELS[t]}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Localização" htmlFor="location" hint="Opcional">
          <Input id="location" {...register('location')} placeholder="Pátio central -- filial São Paulo" />
        </FormField>
        <FormField label="Capacidade (litros)" htmlFor="capacityLiters" required error={errors.capacityLiters?.message}>
          <Input id="capacityLiters" type="number" step="0.001" min="0.001" {...register('capacityLiters')} />
        </FormField>
        <FormField
          label="Estoque inicial (litros)"
          htmlFor="initialStockLiters"
          required
          error={errors.initialStockLiters?.message}
          hint="Gera a primeira movimentação (saldo inicial)."
        >
          <Input id="initialStockLiters" type="number" step="0.001" min="0" {...register('initialStockLiters')} />
        </FormField>
        <FormField
          label="Estoque mínimo (litros)"
          htmlFor="minStockLiters"
          error={errors.minStockLiters?.message}
          hint="Opcional -- usado para calcular estoque baixo."
        >
          <Input id="minStockLiters" type="number" step="0.001" min="0" {...register('minStockLiters')} />
        </FormField>
      </form>
    </Modal>
  );
}
