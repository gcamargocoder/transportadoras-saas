'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createTollTransaction } from '../../lib/api/tolls.api';
import { getTripComposition } from '../../lib/api/fleet.api';
import { getTrip } from '../../lib/api/trips.api';
import { TRIP_STATUS_LABELS } from '../../lib/labels';
import type { TollPlazaEntity, TripEntity } from '../../types/entities';
import { formatDateTime } from '../../utils/format';
import { computeTollAuditPreview } from './audit-verdict';
import { PlazaPicker } from './plaza-picker';
import { TollAuditPreviewCard } from './toll-audit-preview';
import { TripPicker } from './trip-picker';

const schema = z.object({
  tripId: z.string().uuid('Selecione a viagem.'),
  tollPlazaId: z.string().uuid('Selecione a praça de pedágio.'),
  axleCount: z.coerce.number().int().positive('Informe a quantidade de eixos.'),
  chargedAmount: z.coerce.number().min(0, 'Informe um valor maior ou igual a zero.'),
  chargedAt: z.string().min(1, 'Informe a data/hora da cobrança.'),
});

type FormValues = z.infer<typeof schema>;

export function CreateTollModal({
  open,
  onClose,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  tripId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedTrip, setSelectedTrip] = useState<TripEntity | null>(null);
  const [selectedPlaza, setSelectedPlaza] = useState<TollPlazaEntity | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tripId: tripId ?? '' },
  });

  // Modo embutido (aba de Pedágios da viagem): a viagem ja vem fixada por
  // id -- carrega os dados reais dela para exibir o resumo, em vez de
  // reimplementar uma segunda fonte de dados de viagem.
  const fixedTripQuery = useQuery({
    queryKey: ['trips', tripId],
    queryFn: () => getTrip(tripId as string),
    enabled: Boolean(tripId) && open,
  });
  useEffect(() => {
    if (fixedTripQuery.data) setSelectedTrip(fixedTripQuery.data);
  }, [fixedTripQuery.data]);

  const compositionQuery = useQuery({
    queryKey: ['trip-compositions', selectedTrip?.compositionId],
    queryFn: () => getTripComposition(selectedTrip?.compositionId as string),
    enabled: Boolean(selectedTrip?.compositionId),
  });

  useEffect(() => {
    const totalAxles = compositionQuery.data?.axleConfiguration?.totalAxles;
    if (totalAxles) setValue('axleCount', totalAxles);
  }, [compositionQuery.data, setValue]);

  const axleCount = watch('axleCount');
  const chargedAmount = watch('chargedAmount');
  const preview = computeTollAuditPreview(
    selectedPlaza?.pricePerAxle ?? null,
    Number.isFinite(axleCount) && axleCount > 0 ? axleCount : null,
    Number.isFinite(chargedAmount) ? chargedAmount : null,
  );

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createTollTransaction({
        ...values,
        chargedAt: new Date(values.chargedAt).toISOString(),
        source: 'MANUAL',
      }),
    onSuccess: () => {
      toast.success('Pedágio registrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['toll-transactions'] });
      handleClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar o pedágio.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ tripId: tripId ?? '' });
    setSelectedTrip(null);
    setSelectedPlaza(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Registrar pedágio manual"
      description="Use quando a transação não vier de uma importação de extrato."
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
            Registrar
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        {!tripId && (
          <FormField label="Viagem" htmlFor="tripId" required error={errors.tripId?.message}>
            <Controller
              control={control}
              name="tripId"
              render={({ field }) => (
                <TripPicker
                  id="tripId"
                  selectedTrip={selectedTrip}
                  onSelect={(trip) => {
                    setSelectedTrip(trip);
                    field.onChange(trip.id);
                  }}
                  onClear={() => {
                    setSelectedTrip(null);
                    field.onChange('');
                  }}
                  invalid={Boolean(errors.tripId)}
                />
              )}
            />
          </FormField>
        )}

        {selectedTrip && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-subtle p-3 text-sm sm:grid-cols-4">
            <SummaryField label="Veículo" value={selectedTrip.vehiclePlate ?? '-'} />
            <SummaryField
              label="Eixos (composição)"
              value={
                compositionQuery.isLoading
                  ? '...'
                  : (compositionQuery.data?.axleConfiguration?.totalAxles?.toString() ??
                    'Não informado')
              }
            />
            <SummaryField label="Motorista" value={selectedTrip.driverName ?? '-'} />
            <SummaryField label="Status" value={TRIP_STATUS_LABELS[selectedTrip.status]} />
            <SummaryField
              label="Rota"
              value={`${selectedTrip.originName} → ${selectedTrip.destinationName}`}
              className="col-span-2"
            />
            <SummaryField
              label="Saída prevista"
              value={formatDateTime(selectedTrip.plannedDeparture)}
              className="col-span-2"
            />
          </div>
        )}

        <FormField
          label="Praça de pedágio"
          htmlFor="tollPlazaId"
          required
          error={errors.tollPlazaId?.message}
        >
          <Controller
            control={control}
            name="tollPlazaId"
            render={({ field }) => (
              <PlazaPicker
                id="tollPlazaId"
                selectedPlaza={selectedPlaza}
                onSelect={(plaza) => {
                  setSelectedPlaza(plaza);
                  field.onChange(plaza.id);
                }}
                onClear={() => {
                  setSelectedPlaza(null);
                  field.onChange('');
                }}
                invalid={Boolean(errors.tollPlazaId)}
              />
            )}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Quantidade de eixos"
            htmlFor="axleCount"
            required
            error={errors.axleCount?.message}
            hint={
              compositionQuery.data?.axleConfiguration?.totalAxles
                ? 'Pré-preenchido pela composição da viagem — confirme ou ajuste.'
                : undefined
            }
          >
            <Input
              id="axleCount"
              type="number"
              min={1}
              invalid={Boolean(errors.axleCount)}
              {...register('axleCount')}
            />
          </FormField>
          <FormField
            label="Valor cobrado (R$)"
            htmlFor="chargedAmount"
            required
            error={errors.chargedAmount?.message}
          >
            <Input
              id="chargedAmount"
              type="number"
              step="0.01"
              min={0}
              invalid={Boolean(errors.chargedAmount)}
              {...register('chargedAmount')}
            />
          </FormField>
        </div>

        <FormField
          label="Data/hora da cobrança"
          htmlFor="chargedAt"
          required
          error={errors.chargedAt?.message}
        >
          <Input
            id="chargedAt"
            type="datetime-local"
            invalid={Boolean(errors.chargedAt)}
            {...register('chargedAt')}
          />
        </FormField>

        {selectedPlaza && Number.isFinite(chargedAmount) && (
          <TollAuditPreviewCard preview={preview} chargedAmount={chargedAmount} />
        )}
      </form>
    </Modal>
  );
}

function SummaryField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={className}>
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="truncate text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
