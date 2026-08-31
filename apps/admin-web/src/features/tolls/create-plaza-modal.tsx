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
import { createTollPlaza } from '../../lib/api/tolls.api';
import { TOLL_PLAZA_TYPE_LABELS } from '../../lib/labels';
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

// Praca de pedagio e dado GLOBAL (sem tenantId) -- escrita restrita a
// SUPER_ADMIN no backend (ver TOLL_PLAZAS controller); esta tela so e
// visivel a esse perfil (ver nav-config.ts).
export function CreatePlazaModal({
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
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createTollPlaza(values),
    onSuccess: () => {
      toast.success('Praça cadastrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['toll-plazas'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível cadastrar a praça.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova praça de pedágio"
      description="Cadastro global — usado por todas as transportadoras."
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
        <FormField
          label="Concessionária"
          htmlFor="operator"
          required
          error={errors.operator?.message}
        >
          <Input
            id="operator"
            invalid={Boolean(errors.operator)}
            {...register('operator')}
            placeholder="CCR ViaOeste"
          />
        </FormField>
        <FormField
          label="Tipo"
          htmlFor="type"
          hint="Praça física (cancela) ou pórtico Free Flow (cobrança eletrônica sem parada)."
        >
          <Select id="type" defaultValue={TollPlazaType.PHYSICAL_PLAZA} {...register('type')}>
            {Object.values(TollPlazaType).map((type) => (
              <option key={type} value={type}>
                {TOLL_PLAZA_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Rodovia" htmlFor="highway" hint="Opcional">
            <Input id="highway" {...register('highway')} placeholder="SP-280" />
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
          hint="Essencial para a conferência automática de pedágio. Deixe em branco se ainda não souber."
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
