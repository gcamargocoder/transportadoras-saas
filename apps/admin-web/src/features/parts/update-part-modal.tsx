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
import { updatePart } from '../../lib/api/parts.api';
import type { PartEntity } from '../../types/entities';

const schema = z.object({
  sku: z.string().min(1, 'Informe o SKU.'),
  name: z.string().min(1, 'Informe o nome.'),
  unit: z.string().min(1, 'Informe a unidade.'),
  description: z.string().optional(),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  oemCode: z.string().optional(),
  minStock: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

// currentStock/isActive nunca sao editaveis aqui de proposito -- estoque
// muda via movimentacoes (entrada/saida/ajuste), ativo/inativo via
// PATCH /parts/:id/status (secao 1 vs 3 do pedido da Fase 83, nunca
// misturadas no mesmo formulario).
export function UpdatePartModal({
  open,
  onClose,
  part,
}: {
  open: boolean;
  onClose: () => void;
  part: PartEntity;
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
        sku: part.sku,
        name: part.name,
        unit: part.unit,
        description: part.description ?? '',
        category: part.category ?? '',
        manufacturer: part.manufacturer ?? '',
        oemCode: part.oemCode ?? '',
        minStock: part.minStock ?? undefined,
      });
    }
  }, [open, part, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => updatePart(part.id, values),
    onSuccess: () => {
      toast.success('Peça atualizada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível atualizar a peça.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar peça"
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
        <FormField label="SKU" htmlFor="sku" required error={errors.sku?.message}>
          <Input id="sku" {...register('sku')} />
        </FormField>
        <FormField label="Nome" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </FormField>
        <FormField label="Unidade" htmlFor="unit" required error={errors.unit?.message}>
          <Input id="unit" {...register('unit')} />
        </FormField>
        <FormField label="Categoria" htmlFor="category" hint="Opcional">
          <Input id="category" {...register('category')} />
        </FormField>
        <FormField label="Fabricante" htmlFor="manufacturer" hint="Opcional">
          <Input id="manufacturer" {...register('manufacturer')} />
        </FormField>
        <FormField label="Código OEM" htmlFor="oemCode" hint="Opcional">
          <Input id="oemCode" {...register('oemCode')} />
        </FormField>
        <FormField label="Estoque mínimo" htmlFor="minStock" hint="Opcional -- usado para calcular estoque baixo.">
          <Input id="minStock" type="number" step="0.01" {...register('minStock')} />
        </FormField>
        <FormField label="Descrição" htmlFor="description" className="sm:col-span-2" hint="Opcional">
          <Input id="description" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
