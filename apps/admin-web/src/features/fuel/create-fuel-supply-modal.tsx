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
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { listDrivers } from '../../lib/api/drivers.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listVehicles } from '../../lib/api/fleet.api';
import { createFuelSupply, listFuelStations } from '../../lib/api/fuel.api';
import { listTrips } from '../../lib/api/trips.api';
import { FUEL_TYPE_LABELS, PAYMENT_TYPE_LABELS } from '../../lib/labels';
import type { PaymentType } from '../../types/enums';
import { tripSelectLabel } from '../tolls/trip-select-label';

const schema = z
  .object({
    tripId: z.string().optional(),
    vehicleId: z.string().optional(),
    driverId: z.string().optional(),
    fuelStationId: z.string().uuid('Selecione o posto.'),
    fuelType: z.enum(['DIESEL_S10', 'DIESEL_S500', 'GASOLINA', 'ETANOL', 'ARLA32', 'OUTRO']),
    liters: z.coerce.number().positive('Informe a quantidade de litros.'),
    pricePerLiter: z.coerce.number().positive('Informe o preço por litro.'),
    odometerKm: z.coerce.number().nonnegative('Informe o odômetro.'),
    supplyDate: z.string().min(1, 'Informe a data do abastecimento.'),
    paymentType: z.string().optional(),
    invoiceNumber: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.tripId) {
      if (!values.vehicleId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vehicleId'],
          message: 'Obrigatório quando não há viagem vinculada.',
        });
      }
      if (!values.driverId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['driverId'],
          message: 'Obrigatório quando não há viagem vinculada.',
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

export function CreateFuelSupplyModal({
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
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fuelType: 'DIESEL_S10' },
  });

  const tripId = watch('tripId');

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createFuelSupply({
        ...values,
        tripId: values.tripId || undefined,
        vehicleId: values.tripId ? undefined : values.vehicleId,
        driverId: values.tripId ? undefined : values.driverId,
        supplyDate: new Date(values.supplyDate).toISOString(),
        paymentType: values.paymentType ? (values.paymentType as PaymentType) : undefined,
      }),
    onSuccess: () => {
      toast.success('Abastecimento registrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['fuel-supplies'] });
      reset();
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível registrar o abastecimento.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo abastecimento"
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
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField
          label="Viagem"
          htmlFor="tripId"
          className="sm:col-span-2"
          hint="Opcional — se informada, veículo e motorista são herdados da viagem."
        >
          <Controller
            control={control}
            name="tripId"
            render={({ field }) => (
              <EntitySelect
                id="tripId"
                queryKey={['trips', 'select']}
                queryFn={() => listTrips({ pageSize: 100 })}
                getOptionValue={(t) => t.id}
                getOptionLabel={tripSelectLabel}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>

        {!tripId && (
          <>
            <FormField
              label="Veículo"
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
            <FormField
              label="Motorista"
              htmlFor="driverId"
              required
              error={errors.driverId?.message}
            >
              <Controller
                control={control}
                name="driverId"
                render={({ field }) => (
                  <EntitySelect
                    id="driverId"
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
          </>
        )}

        <FormField
          label="Posto"
          htmlFor="fuelStationId"
          required
          error={errors.fuelStationId?.message}
          className="sm:col-span-2"
        >
          <Controller
            control={control}
            name="fuelStationId"
            render={({ field }) => (
              <EntitySelect
                id="fuelStationId"
                queryKey={['fuel-stations', 'select']}
                queryFn={() => listFuelStations({ pageSize: 100 })}
                getOptionValue={(s) => s.id}
                getOptionLabel={(s) => s.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.fuelStationId)}
              />
            )}
          />
        </FormField>

        <FormField label="Combustível" htmlFor="fuelType" required>
          <Select id="fuelType" {...register('fuelType')}>
            {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Forma de pagamento" htmlFor="paymentType" hint="Opcional">
          <Select id="paymentType" {...register('paymentType')}>
            <option value="">Não informado</option>
            {Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Litros" htmlFor="liters" required error={errors.liters?.message}>
          <Input
            id="liters"
            type="number"
            step="0.001"
            invalid={Boolean(errors.liters)}
            {...register('liters')}
          />
        </FormField>
        <FormField
          label="Preço por litro (R$)"
          htmlFor="pricePerLiter"
          required
          error={errors.pricePerLiter?.message}
        >
          <Input
            id="pricePerLiter"
            type="number"
            step="0.0001"
            invalid={Boolean(errors.pricePerLiter)}
            {...register('pricePerLiter')}
          />
        </FormField>
        <FormField
          label="Odômetro (km)"
          htmlFor="odometerKm"
          required
          error={errors.odometerKm?.message}
        >
          <Input
            id="odometerKm"
            type="number"
            invalid={Boolean(errors.odometerKm)}
            {...register('odometerKm')}
          />
        </FormField>
        <FormField
          label="Data do abastecimento"
          htmlFor="supplyDate"
          required
          error={errors.supplyDate?.message}
        >
          <Input
            id="supplyDate"
            type="datetime-local"
            invalid={Boolean(errors.supplyDate)}
            {...register('supplyDate')}
          />
        </FormField>
        <FormField label="Nota fiscal" htmlFor="invoiceNumber" hint="Opcional">
          <Input id="invoiceNumber" {...register('invoiceNumber')} />
        </FormField>
      </form>
    </Modal>
  );
}
