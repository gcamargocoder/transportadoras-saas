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
import { createPart } from '../../lib/api/parts.api';

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

export function CreatePartModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createPart(values),
    onSuccess: () => {
      toast.success('Peça cadastrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível cadastrar a peça.', toFriendlyMessage(error)),
  });

  function handleClose(): void {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova peça"
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
        <FormField label="SKU" htmlFor="sku" required error={errors.sku?.message}>
          <Input id="sku" {...register('sku')} placeholder="FLT-OL-001" />
        </FormField>
        <FormField label="Nome" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" {...register('name')} placeholder="Filtro de óleo" />
        </FormField>
        <FormField label="Unidade" htmlFor="unit" required error={errors.unit?.message}>
          <Input id="unit" {...register('unit')} placeholder="UN" />
        </FormField>
        <FormField label="Categoria" htmlFor="category" hint="Opcional">
          <Input id="category" {...register('category')} placeholder="Filtros" />
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
