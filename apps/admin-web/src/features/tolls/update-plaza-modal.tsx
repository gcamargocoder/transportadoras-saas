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
import { updateTollPlaza } from '../../lib/api/tolls.api';
import { TOLL_PLAZA_TYPE_LABELS } from '../../lib/labels';
import type { TollPlazaEntity } from '../../types/entities';
import { TollPlazaType } from '../../types/enums';

const schema = z.object({
  name: z.string().min(2, 'Informe o nome da praça.'),
  operator: z.string().min(2, 'Informe a concessionária.'),
  type: z.enum(['PHYSICAL_PLAZA', 'FREE_FLOW_GANTRY']).optional(),
  highway: z.string().optional(),
  km: z.coerce.number().min(0, 'Km não pode ser negativo.').optional(),
  city: z.string().optional(),
  state: z.string().max(2).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  pricePerAxle: z.coerce.number().positive('Informe um valor maior que zero.').optional(),
});

type FormValues = z.infer<typeof schema>;

export function UpdatePlazaModal({
  open,
  onClose,
  plaza,
}: {
  open: boolean;
  onClose: () => void;
  plaza: TollPlazaEntity;
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
        name: plaza.name,
        operator: plaza.operator,
        type: plaza.type,
        highway: plaza.highway ?? '',
        km: plaza.km ?? undefined,
        city: plaza.city ?? '',
        state: plaza.state ?? '',
        latitude: plaza.latitude ?? undefined,
        longitude: plaza.longitude ?? undefined,
        pricePerAxle: plaza.pricePerAxle ?? undefined,
      });
    }
  }, [open, plaza, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => updateTollPlaza(plaza.id, values),
    onSuccess: () => {
      toast.success('Praça atualizada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['toll-plazas'] });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar a praça.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar ${plaza.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit((values) => mutation.mutate(values))}
            loading={isSubmitting}
          >
            Salvar alterações
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Nome" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
        </FormField>
        <FormField
          label="Concessionária"
          htmlFor="operator"
          required
          error={errors.operator?.message}
        >
          <Input id="operator" invalid={Boolean(errors.operator)} {...register('operator')} />
        </FormField>
        <FormField
          label="Tipo"
          htmlFor="type"
          hint="Praça física (cancela) ou pórtico Free Flow (cobrança eletrônica sem parada)."
        >
          <Select id="type" {...register('type')}>
            {Object.values(TollPlazaType).map((type) => (
              <option key={type} value={type}>
                {TOLL_PLAZA_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Rodovia" htmlFor="highway" hint="Opcional">
            <Input id="highway" {...register('highway')} />
          </FormField>
          <FormField label="UF" htmlFor="state" hint="Opcional">
            <Input id="state" maxLength={2} {...register('state')} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Cidade" htmlFor="city" hint="Opcional">
            <Input id="city" {...register('city')} />
          </FormField>
          <FormField label="Km" htmlFor="km" hint="Opcional">
            <Input id="km" type="number" step="0.001" min={0} {...register('km')} />
          </FormField>
        </div>
        <FormField
          label="Latitude / Longitude"
          htmlFor="latitude"
          error={errors.latitude?.message ?? errors.longitude?.message}
          hint="Essencial para o motor de rotas identificar a praça/pórtico automaticamente. Deixe em branco se ainda não souber (nunca invente uma coordenada)."
        >
          <div className="grid grid-cols-2 gap-4">
            <Input id="latitude" type="number" step="0.0000001" {...register('latitude')} placeholder="-23.5505" />
            <Input id="longitude" type="number" step="0.0000001" {...register('longitude')} placeholder="-46.6333" />
          </div>
        </FormField>
        <FormField
          label="Valor por eixo (R$)"
          htmlFor="pricePerAxle"
          error={errors.pricePerAxle?.message}
          hint="Essencial para a conferência automática de pedágio."
        >
          <Input
            id="pricePerAxle"
            type="number"
            step="0.01"
            min={0}
            invalid={Boolean(errors.pricePerAxle)}
            {...register('pricePerAxle')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
