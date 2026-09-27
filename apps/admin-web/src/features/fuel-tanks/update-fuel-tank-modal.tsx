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
import { updateFuelTank } from '../../lib/api/fuel-tanks.api';
import type { FuelTankEntity } from '../../types/entities';

const schema = z.object({
  name: z.string().min(1, 'Informe o nome.'),
  minStockLiters: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  location: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// capacityLiters/initialStockLiters/currentStockLiters/fuelType nunca sao
// editaveis aqui de proposito -- alterar a capacidade/tipo de um tanque em
// operacao exigiria reconciliar o estoque ja movimentado (fora do escopo
// da Fase 1, ver UpdateFuelTankDto no backend). Ativo/inativo tem seu
// proprio botao na tela de detalhe, nunca misturado a este formulario.
export function UpdateFuelTankModal({
  open,
  onClose,
  tank,
}: {
  open: boolean;
  onClose: () => void;
  tank: FuelTankEntity;
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
        name: tank.name,
        minStockLiters: tank.minStockLiters ?? undefined,
        location: tank.location ?? '',
      });
    }
  }, [open, tank, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateFuelTank(tank.id, {
        name: values.name,
        minStockLiters: values.minStockLiters === '' || values.minStockLiters === undefined ? undefined : values.minStockLiters,
        location: values.location || undefined,
      }),
    onSuccess: () => {
      toast.success('Tanque atualizado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível atualizar o tanque.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar tanque"
      size="sm"
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
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Nome" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </FormField>
        <FormField label="Localização" htmlFor="location" hint="Opcional">
          <Input id="location" {...register('location')} />
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
