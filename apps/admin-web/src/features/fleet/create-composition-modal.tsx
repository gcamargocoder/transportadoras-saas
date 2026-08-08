'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createTripComposition, listTrailers, listVehicles } from '../../lib/api/fleet.api';

const schema = z.object({
  vehicleId: z.string().uuid('Selecione o veículo (cavalo mecânico).'),
  trailerId1: z.string().optional(),
  trailerId2: z.string().optional(),
  totalAxles: z.coerce.number().int().min(2, 'A composição deve ter no mínimo 2 eixos.'),
  raisedAxles: z.coerce.number().int().min(0).default(0),
  loweredAxles: z.coerce.number().int().min(0).default(0),
  suspendedAxles: z.coerce.number().int().min(0).default(0),
  steeringAxles: z.coerce.number().int().min(0).default(0),
  tractionAxles: z.coerce.number().int().min(0).default(0),
  billableCategory: z.string().min(1, 'Informe a categoria de cobrança (ex: "6 eixos").'),
});

type FormValues = z.infer<typeof schema>;

// A configuracao de eixos aqui e a mesma usada pelo motor de conferencia de
// pedagio para pre-preencher axleCount no registro de transacao (ver
// features/tolls/create-toll-modal.tsx) -- por isso e obrigatoria neste
// formulario, mesmo o backend tratando axleConfiguration como opcional.
export function CreateCompositionModal({
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
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      totalAxles: 2,
      raisedAxles: 0,
      loweredAxles: 0,
      suspendedAxles: 0,
      steeringAxles: 1,
      tractionAxles: 1,
      billableCategory: '2 eixos',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const trailers = [values.trailerId1, values.trailerId2]
        .map((trailerId, index) => (trailerId ? { trailerId, positionOrder: index + 1 } : null))
        .filter((item): item is { trailerId: string; positionOrder: number } => item !== null);

      return createTripComposition({
        vehicleId: values.vehicleId,
        trailers: trailers.length > 0 ? trailers : undefined,
        axleConfiguration: {
          totalAxles: values.totalAxles,
          raisedAxles: values.raisedAxles,
          loweredAxles: values.loweredAxles,
          suspendedAxles: values.suspendedAxles,
          steeringAxles: values.steeringAxles,
          tractionAxles: values.tractionAxles,
          billableCategory: values.billableCategory,
        },
      });
    },
    onSuccess: () => {
      toast.success('Composição criada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['trip-compositions'] });
      handleClose();
    },
    onError: (error) =>
      toast.error('Não foi possível criar a composição.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova composição"
      description="Veículo + carretas (opcional) + configuração de eixos, usada nas viagens e na conferência de pedágio."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit((values) => mutation.mutate(values))}
            loading={isSubmitting}
          >
            Criar composição
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField
          label="Veículo (cavalo mecânico)"
          htmlFor="vehicleId"
          required
          error={errors.vehicleId?.message}
        >
          <Controller
            control={control}
            name="vehicleId"
            render={({ field }) => (
              <EntitySelect
                id="vehicleId"
                queryKey={['vehicles', 'select']}
                queryFn={() => listVehicles({ pageSize: 100 })}
                getOptionValue={(v) => v.id}
                getOptionLabel={(v) => `${v.plate} · ${v.brand} ${v.model}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.vehicleId)}
              />
            )}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="1ª carreta" htmlFor="trailerId1" hint="Opcional">
            <Controller
              control={control}
              name="trailerId1"
              render={({ field }) => (
                <EntitySelect
                  id="trailerId1"
                  queryKey={['trailers', 'select']}
                  queryFn={() => listTrailers({ pageSize: 100 })}
                  getOptionValue={(t) => t.id}
                  getOptionLabel={(t) => t.plate}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Nenhuma"
                />
              )}
            />
          </FormField>
          <FormField label="2ª carreta" htmlFor="trailerId2" hint="Opcional — bitrem/rodotrem">
            <Controller
              control={control}
              name="trailerId2"
              render={({ field }) => (
                <EntitySelect
                  id="trailerId2"
                  queryKey={['trailers', 'select']}
                  queryFn={() => listTrailers({ pageSize: 100 })}
                  getOptionValue={(t) => t.id}
                  getOptionLabel={(t) => t.plate}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Nenhuma"
                />
              )}
            />
          </FormField>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Configuração de eixos (usada na conferência de pedágio)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FormField
              label="Total de eixos"
              htmlFor="totalAxles"
              required
              error={errors.totalAxles?.message}
            >
              <Input
                id="totalAxles"
                type="number"
                min={2}
                invalid={Boolean(errors.totalAxles)}
                {...register('totalAxles')}
              />
            </FormField>
            <FormField label="Direcionais" htmlFor="steeringAxles">
              <Input id="steeringAxles" type="number" min={0} {...register('steeringAxles')} />
            </FormField>
            <FormField label="De tração" htmlFor="tractionAxles">
              <Input id="tractionAxles" type="number" min={0} {...register('tractionAxles')} />
            </FormField>
            <FormField label="Levantados" htmlFor="raisedAxles">
              <Input id="raisedAxles" type="number" min={0} {...register('raisedAxles')} />
            </FormField>
            <FormField label="Suspensos" htmlFor="suspendedAxles">
              <Input id="suspendedAxles" type="number" min={0} {...register('suspendedAxles')} />
            </FormField>
            <FormField label="Abaixados" htmlFor="loweredAxles">
              <Input id="loweredAxles" type="number" min={0} {...register('loweredAxles')} />
            </FormField>
          </div>
          <FormField
            label="Categoria de cobrança"
            htmlFor="billableCategory"
            required
            error={errors.billableCategory?.message}
            hint='Ex: "2 eixos", "6 eixos" — categoria usada pelas concessionárias.'
            className="mt-3"
          >
            <Input
              id="billableCategory"
              invalid={Boolean(errors.billableCategory)}
              {...register('billableCategory')}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
