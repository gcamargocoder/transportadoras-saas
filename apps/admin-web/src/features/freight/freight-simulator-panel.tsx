'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { toFriendlyMessage } from '../../lib/api/errors';
import { simulateFreight } from '../../lib/api/freight.api';
import { listCustomers } from '../../lib/api/trips.api';
import { VEHICLE_TYPE_LABELS, labelOrValue } from '../../lib/labels';
import { VehicleType } from '../../types/enums';
import { formatCurrency } from '../../utils/format';

const numberField = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))
  .optional();

const schema = z.object({
  customerId: z.string().uuid('Selecione o cliente.'),
  originRegion: z.string().optional(),
  destinationRegion: z.string().optional(),
  cargoType: z.string().optional(),
  vehicleType: z.union([z.nativeEnum(VehicleType), z.literal('')]).optional(),
  distanceKm: numberField,
  weightKg: numberField,
  cubageM3: numberField,
  riskCargo: z.boolean().optional(),
  nightService: z.boolean().optional(),
  dailyCount: numberField,
  demurrageCount: numberField,
});

type FormValues = z.infer<typeof schema>;

export function FreightSimulatorPanel(): JSX.Element {
  const {
    handleSubmit,
    register,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { customerId: '' } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      simulateFreight({
        customerId: values.customerId,
        originRegion: values.originRegion || undefined,
        destinationRegion: values.destinationRegion || undefined,
        cargoType: values.cargoType || undefined,
        vehicleType: values.vehicleType || undefined,
        distanceKm: values.distanceKm,
        weightKg: values.weightKg,
        cubageM3: values.cubageM3,
        riskCargo: values.riskCargo,
        nightService: values.nightService,
        dailyCount: values.dailyCount,
        demurrageCount: values.demurrageCount,
      }),
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Simulador de frete" description="Testa o cálculo sem persistir nada. O backend é sempre a fonte da verdade do valor." />
        <form className="flex flex-col gap-4 p-5" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <FormField label="Cliente" htmlFor="sim-customer" required error={errors.customerId?.message}>
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <EntitySelect
                  id="sim-customer"
                  queryKey={['customers', 'select']}
                  queryFn={() => listCustomers({ pageSize: 100 })}
                  getOptionValue={(c) => c.id}
                  getOptionLabel={(c) => c.name}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  invalid={Boolean(errors.customerId)}
                />
              )}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Região de origem" htmlFor="sim-origin-region">
              <Input id="sim-origin-region" {...register('originRegion')} />
            </FormField>
            <FormField label="Região de destino" htmlFor="sim-destination-region">
              <Input id="sim-destination-region" {...register('destinationRegion')} />
            </FormField>
            <FormField label="Tipo de carga" htmlFor="sim-cargo-type">
              <Input id="sim-cargo-type" {...register('cargoType')} />
            </FormField>
            <FormField label="Tipo de veículo" htmlFor="sim-vehicle-type">
              <Select id="sim-vehicle-type" {...register('vehicleType')}>
                <option value="">Qualquer</option>
                {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
                  <option key={t} value={t}>
                    {labelOrValue(VEHICLE_TYPE_LABELS, t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Distância (km)" htmlFor="sim-distance">
              <Input id="sim-distance" type="number" min={0} step="0.1" {...register('distanceKm')} />
            </FormField>
            <FormField label="Peso (kg)" htmlFor="sim-weight">
              <Input id="sim-weight" type="number" min={0} step="0.1" {...register('weightKg')} />
            </FormField>
            <FormField label="Cubagem (m³)" htmlFor="sim-cubage">
              <Input id="sim-cubage" type="number" min={0} step="0.01" {...register('cubageM3')} />
            </FormField>
            <FormField label="Diárias" htmlFor="sim-daily">
              <Input id="sim-daily" type="number" min={0} step="1" {...register('dailyCount')} />
            </FormField>
            <FormField label="Estadias" htmlFor="sim-demurrage">
              <Input id="sim-demurrage" type="number" min={0} step="1" {...register('demurrageCount')} />
            </FormField>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="h-4 w-4 rounded border-border" {...register('riskCargo')} />
              Carga com risco
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="h-4 w-4 rounded border-border" {...register('nightService')} />
              Serviço noturno
            </label>
          </div>
          <Button type="submit" loading={mutation.isPending}>
            <Calculator size={16} />
            Simular
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Resultado" description="Nunca inventa preço: se não houver regra aplicável, o motivo é exibido explicitamente." />
        <div className="p-5">
          {mutation.isError && (
            <p className="text-sm text-danger-600">{toFriendlyMessage(mutation.error)}</p>
          )}
          {!mutation.data && !mutation.isError && (
            <p className="text-sm text-ink-subtle">Preencha os parâmetros e clique em Simular.</p>
          )}
          {mutation.data && !mutation.data.available && (
            <div className="flex flex-col gap-2">
              <Badge tone="warning">Sem tabela/regra aplicável</Badge>
              <p className="text-sm text-ink-subtle">{mutation.data.reason}</p>
            </div>
          )}
          {mutation.data?.available && (
            <div className="flex flex-col gap-3">
              <Badge tone="success">Cotação calculada</Badge>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-subtle">Tabela</dt>
                <dd className="text-right">{mutation.data.freightTableName ?? '—'}</dd>
                <dt className="text-ink-subtle">Versão da regra</dt>
                <dd className="text-right">v{mutation.data.ruleVersion}</dd>
                <dt className="text-ink-subtle">Valor base</dt>
                <dd className="text-right">{formatCurrency(mutation.data.baseAmount)}</dd>
                <dt className="text-ink-subtle">Adicionais</dt>
                <dd className="text-right">{formatCurrency(mutation.data.additionsAmount)}</dd>
                <dt className="text-ink-subtle">Pedágio</dt>
                <dd className="text-right">{formatCurrency(mutation.data.tollAmount)}</dd>
                <dt className="text-ink-subtle">Taxas</dt>
                <dd className="text-right">{formatCurrency(mutation.data.feesAmount)}</dd>
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="text-right text-lg font-semibold text-ink">{formatCurrency(mutation.data.totalAmount)}</dd>
              </dl>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
