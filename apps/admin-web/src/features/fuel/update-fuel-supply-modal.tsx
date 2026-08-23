'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listFuelStations, updateFuelSupply } from '../../lib/api/fuel.api';
import { FUEL_TYPE_LABELS, PAYMENT_TYPE_LABELS } from '../../lib/labels';
import type { FuelSupplyEntity } from '../../types/entities';
import type { PaymentType } from '../../types/enums';

const schema = z.object({
  fuelStationId: z.string().uuid('Selecione o posto.'),
  fuelType: z.enum(['DIESEL_S10', 'DIESEL_S500', 'GASOLINA', 'ETANOL', 'ARLA32', 'OUTRO']),
  liters: z.coerce.number().positive('Informe a quantidade de litros.'),
  pricePerLiter: z.coerce.number().positive('Informe o preço por litro.'),
  odometerKm: z.coerce.number().nonnegative('Informe o odômetro.'),
  supplyDate: z.string().min(1, 'Informe a data do abastecimento.'),
  paymentType: z.string().optional(),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

// Fase 65 -- "editar enquanto permitido" (updateFuelSupply/deleteFuelSupply
// ja existiam no client de API, mas nunca eram chamados por nenhuma tela).
// vehicleId/driverId/tripId nunca sao editaveis aqui de proposito: o
// backend ja ignora esses campos quando o abastecimento pertence a uma
// viagem (tripId imutavel), e reatribuir veiculo/motorista de um lancamento
// avulso e uma correcao de cadastro, fora do escopo desta edicao rapida.
export function UpdateFuelSupplyModal({
  open,
  onClose,
  supply,
}: {
  open: boolean;
  onClose: () => void;
  supply: FuelSupplyEntity;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        fuelStationId: supply.fuelStationId,
        fuelType: supply.fuelType,
        liters: supply.liters,
        pricePerLiter: supply.pricePerLiter,
        odometerKm: supply.odometerKm,
        supplyDate: toDatetimeLocal(supply.supplyDate),
        paymentType: supply.paymentType ?? '',
        invoiceNumber: supply.invoiceNumber ?? '',
        notes: supply.notes ?? '',
      });
    }
  }, [open, supply, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateFuelSupply(supply.id, {
        ...values,
        supplyDate: new Date(values.supplyDate).toISOString(),
        paymentType: values.paymentType ? (values.paymentType as PaymentType) : undefined,
      }),
    onSuccess: () => {
      toast.success('Abastecimento atualizado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['fuel-supplies'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar o abastecimento.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar abastecimento"
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
          <Input id="liters" type="number" step="0.001" invalid={Boolean(errors.liters)} {...register('liters')} />
        </FormField>
        <FormField label="Preço por litro (R$)" htmlFor="pricePerLiter" required error={errors.pricePerLiter?.message}>
          <Input
            id="pricePerLiter"
            type="number"
            step="0.0001"
            invalid={Boolean(errors.pricePerLiter)}
            {...register('pricePerLiter')}
          />
        </FormField>
        <FormField label="Odômetro (km)" htmlFor="odometerKm" required error={errors.odometerKm?.message}>
          <Input id="odometerKm" type="number" invalid={Boolean(errors.odometerKm)} {...register('odometerKm')} />
        </FormField>
        <FormField label="Data do abastecimento" htmlFor="supplyDate" required error={errors.supplyDate?.message}>
          <Input id="supplyDate" type="datetime-local" invalid={Boolean(errors.supplyDate)} {...register('supplyDate')} />
        </FormField>
        <FormField label="Nota fiscal" htmlFor="invoiceNumber" hint="Opcional">
          <Input id="invoiceNumber" {...register('invoiceNumber')} />
        </FormField>
        <FormField label="Observações" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>
      </form>
    </Modal>
  );
}
