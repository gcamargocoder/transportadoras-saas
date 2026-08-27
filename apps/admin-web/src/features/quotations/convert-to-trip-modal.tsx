'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { listTripCompositions } from '../../lib/api/fleet.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { convertQuotationToTrip } from '../../lib/api/quotations.api';
import { listTollRoutes } from '../../lib/api/toll-routes.api';
import { listDrivers } from '../../lib/api/drivers.api';
import { TRIP_PRIORITY_LABELS } from '../../lib/labels';

const schema = z.object({
  driverId: z.string().uuid('Selecione o motorista.'),
  compositionId: z.string().uuid('Selecione a composição (veículo + carretas).'),
  tollRouteId: z.union([z.string().uuid(), z.literal('')]).optional(),
  plannedDeparture: z.string().min(1, 'Informe a data/hora de saída prevista.'),
  plannedArrival: z.string().min(1, 'Informe a data/hora de chegada prevista.'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
});

type FormValues = z.infer<typeof schema>;

// Fase 94 -- unica "proxima etapa" que a arquitetura atual suporta: converte
// uma cotacao APPROVED numa viagem real. Motorista/composicao sao sempre
// pedidos aqui (atribuicao operacional que uma cotacao comercial nunca
// teria) -- reaproveita a MESMA criacao de viagem ja usada em CreateTripModal.
export function ConvertToTripModal({
  open,
  onClose,
  quotationId,
}: {
  open: boolean;
  onClose: () => void;
  quotationId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { priority: 'NORMAL' } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      convertQuotationToTrip(quotationId, {
        ...values,
        tollRouteId: values.tollRouteId || undefined,
        plannedDeparture: new Date(values.plannedDeparture).toISOString(),
        plannedArrival: new Date(values.plannedArrival).toISOString(),
      }),
    onSuccess: (quotation) => {
      toast.success('Cotação convertida em viagem.');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      reset();
      onClose();
      if (quotation.convertedTripId) router.push(`/trips/${quotation.convertedTripId}`);
    },
    onError: (error) => toast.error('Não foi possível converter a cotação em viagem.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Converter em viagem"
      description="Cliente, origem e destino vêm da própria cotação. Informe motorista e veículo para criar a viagem."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Converter
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Motorista" htmlFor="conv-driver" required error={errors.driverId?.message}>
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <EntitySelect
                id="conv-driver"
                queryKey={['drivers', 'select']}
                queryFn={() => listDrivers({ pageSize: 100, isActive: true })}
                getOptionValue={(d) => d.id}
                getOptionLabel={(d) => d.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.driverId)}
              />
            )}
          />
        </FormField>

        <FormField
          label="Composição (veículo + carretas)"
          htmlFor="conv-composition"
          required
          error={errors.compositionId?.message}
        >
          <Controller
            control={control}
            name="compositionId"
            render={({ field }) => (
              <EntitySelect
                id="conv-composition"
                queryKey={['trip-compositions', 'select']}
                queryFn={() => listTripCompositions({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) =>
                  `${c.vehiclePlate}${c.trailers.length ? ` + ${c.trailers.map((t) => t.trailerPlate).join(', ')}` : ''}`
                }
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.compositionId)}
              />
            )}
          />
        </FormField>

        <FormField label="Saída prevista" htmlFor="conv-departure" required error={errors.plannedDeparture?.message}>
          <Input id="conv-departure" type="datetime-local" invalid={Boolean(errors.plannedDeparture)} {...register('plannedDeparture')} />
        </FormField>

        <FormField label="Chegada prevista" htmlFor="conv-arrival" required error={errors.plannedArrival?.message}>
          <Input id="conv-arrival" type="datetime-local" invalid={Boolean(errors.plannedArrival)} {...register('plannedArrival')} />
        </FormField>

        <FormField label="Prioridade" htmlFor="conv-priority">
          <Select id="conv-priority" {...register('priority')}>
            {Object.entries(TRIP_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Rota de pedágio" htmlFor="conv-toll-route" hint="Opcional">
          <Controller
            control={control}
            name="tollRouteId"
            render={({ field }) => (
              <EntitySelect
                id="conv-toll-route"
                queryKey={['toll-routes', 'select']}
                queryFn={() => listTollRoutes({ pageSize: 100, isActive: true })}
                getOptionValue={(r) => r.id}
                getOptionLabel={(r) => `${r.name} (${r.originLabel} → ${r.destinationLabel})`}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>
      </form>
    </Modal>
  );
}
