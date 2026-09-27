'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { listFuelTanks } from '../../lib/api/fuel-tanks.api';
import { listTrips } from '../../lib/api/trips.api';
import { FUEL_TYPE_LABELS, PAYMENT_TYPE_LABELS } from '../../lib/labels';
import type { FuelTankEntity } from '../../types/entities';
import type { PaymentType } from '../../types/enums';
import { formatNumber } from '../../utils/format';
import { tripSelectLabel } from '../tolls/trip-select-label';

const FUEL_TANKS_QUERY_KEY = ['fuel-tanks', 'select'];

// Fase 7 -- fecha o ciclo do abastecimento: o mesmo FuelSupply agora aceita
// duas origens EXCLUSIVAS (nunca as duas ao mesmo tempo, nunca um segundo
// tipo de registro): INTERNO (tanque proprio -- baixa o estoque na mesma
// transacao, backend reaproveita FuelTanksService.registerInternalFueling,
// a MESMA operacao ja usada pelo Driver App) ou EXTERNO (posto/fornecedor,
// fluxo inalterado desde sempre). pricePerLiter so e obrigatorio no
// EXTERNO -- interno nao tem compra associada a ELE (custo ja pago no
// RECEIPT do tanque).
const schema = z
  .object({
    tripId: z.string().optional(),
    vehicleId: z.string().optional(),
    driverId: z.string().optional(),
    origin: z.enum(['INTERNAL', 'EXTERNAL']),
    fuelTankId: z.string().optional(),
    fuelStationId: z.string().optional(),
    fuelType: z.enum(['DIESEL_S10', 'DIESEL_S500', 'GASOLINA', 'ETANOL', 'ARLA32', 'OUTRO']),
    liters: z.coerce.number().positive('Informe a quantidade de litros.'),
    pricePerLiter: z.coerce.number().nonnegative('Preço não pode ser negativo.').optional(),
    odometerKm: z.coerce.number().nonnegative('Informe o odômetro.'),
    supplyDate: z.string().min(1, 'Informe a data do abastecimento.'),
    paymentType: z.string().optional(),
    invoiceNumber: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.tripId) {
      if (!values.vehicleId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleId'], message: 'Obrigatório quando não há viagem vinculada.' });
      }
      if (!values.driverId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['driverId'], message: 'Obrigatório quando não há viagem vinculada.' });
      }
    }
    if (values.origin === 'INTERNAL') {
      if (!values.fuelTankId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fuelTankId'], message: 'Selecione o tanque de origem.' });
      }
    } else if (values.pricePerLiter === undefined || values.pricePerLiter <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pricePerLiter'], message: 'Informe o preço por litro.' });
    }
  });

type FormValues = z.infer<typeof schema>;

// Mesmo padrão do GranularityControl (Central de Inteligência): segmentado,
// role="radiogroup" -- so 2 opções, não justifica um componente genérico novo.
function OriginControl({ value, onChange }: { value: 'INTERNAL' | 'EXTERNAL'; onChange: (v: 'INTERNAL' | 'EXTERNAL') => void }): JSX.Element {
  const options: { value: 'INTERNAL' | 'EXTERNAL'; label: string }[] = [
    { value: 'EXTERNAL', label: 'Abastecimento externo (posto)' },
    { value: 'INTERNAL', label: 'Abastecimento interno (tanque próprio)' },
  ];
  return (
    <div role="radiogroup" aria-label="Origem do abastecimento" className="flex rounded-lg border border-border bg-surface-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
            value === option.value ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CreateFuelSupplyModal({
  open,
  onClose,
  defaultTripId,
}: {
  open: boolean;
  onClose: () => void;
  // Fase 107 -- pre-seleciona a viagem quando aberto a partir da aba
  // "Combustível" da própria viagem (mesmo padrão de `CreateTollModal`
  // `tripId`); continua editável, nunca travado.
  defaultTripId?: string;
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
    defaultValues: { fuelType: 'DIESEL_S10', origin: 'EXTERNAL', tripId: defaultTripId },
  });

  const tripId = watch('tripId');
  const origin = watch('origin');
  const fuelTankId = watch('fuelTankId');
  const liters = watch('liters');

  // Fase 7, secao 10 -- previa de estoque (so informativa: o backend
  // continua sendo a autoridade sobre o saldo real). Reaproveita o mesmo
  // GET /fuel-tanks ja usado pelo picker (mesma queryKey -- sem consulta
  // duplicada).
  const tanksQuery = useQuery({
    queryKey: FUEL_TANKS_QUERY_KEY,
    queryFn: () => listFuelTanks({ pageSize: 100 }),
    enabled: origin === 'INTERNAL',
  });
  const selectedTank = tanksQuery.data?.items.find((t) => t.id === fuelTankId) ?? null;
  const litersNumber = Number(liters);
  const previewNewStock = selectedTank && Number.isFinite(litersNumber) && litersNumber > 0 ? selectedTank.currentStockLiters - litersNumber : null;

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createFuelSupply({
        ...values,
        tripId: values.tripId || undefined,
        vehicleId: values.tripId ? undefined : values.vehicleId,
        driverId: values.tripId ? undefined : values.driverId,
        fuelTankId: values.origin === 'INTERNAL' ? values.fuelTankId : undefined,
        fuelStationId: values.origin === 'INTERNAL' ? undefined : values.fuelStationId || undefined,
        pricePerLiter: values.origin === 'INTERNAL' ? values.pricePerLiter || undefined : values.pricePerLiter,
        supplyDate: new Date(values.supplyDate).toISOString(),
        paymentType: values.paymentType ? (values.paymentType as PaymentType) : undefined,
      }),
    onSuccess: () => {
      toast.success('Abastecimento registrado com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['fuel-supplies'] });
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks'] });
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
        <FormField label="Origem" htmlFor="origin" className="sm:col-span-2">
          <Controller control={control} name="origin" render={({ field }) => <OriginControl value={field.value} onChange={field.onChange} />} />
        </FormField>

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

        {origin === 'INTERNAL' ? (
          <FormField
            label="Tanque de origem"
            htmlFor="fuelTankId"
            required
            error={errors.fuelTankId?.message}
            className="sm:col-span-2"
          >
            <Controller
              control={control}
              name="fuelTankId"
              render={({ field }) => (
                <EntitySelect<FuelTankEntity>
                  id="fuelTankId"
                  queryKey={FUEL_TANKS_QUERY_KEY}
                  queryFn={() => listFuelTanks({ pageSize: 100 })}
                  getOptionValue={(t) => t.id}
                  getOptionLabel={(t) => `${t.name} · ${formatNumber(t.currentStockLiters)} L disponíveis`}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  invalid={Boolean(errors.fuelTankId)}
                />
              )}
            />
          </FormField>
        ) : (
          <FormField
            label="Posto"
            htmlFor="fuelStationId"
            error={errors.fuelStationId?.message}
            hint="Opcional — deixe em branco quando o posto não for conhecido."
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
                  placeholder="Não informado"
                />
              )}
            />
          </FormField>
        )}

        <FormField label="Combustível" htmlFor="fuelType" required>
          <Select id="fuelType" {...register('fuelType')}>
            {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        {origin === 'EXTERNAL' && (
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
        )}

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
          required={origin === 'EXTERNAL'}
          error={errors.pricePerLiter?.message}
          hint={origin === 'INTERNAL' ? 'Opcional — abastecimento interno não tem compra associada a ele.' : undefined}
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
        {origin === 'EXTERNAL' && (
          <FormField label="Nota fiscal" htmlFor="invoiceNumber" hint="Opcional">
            <Input id="invoiceNumber" {...register('invoiceNumber')} />
          </FormField>
        )}

        {origin === 'INTERNAL' && selectedTank && (
          <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm sm:col-span-2" aria-live="polite">
            <p className="flex justify-between text-ink-muted">
              <span>Estoque atual</span>
              <span className="tabular-nums">{formatNumber(selectedTank.currentStockLiters)} L</span>
            </p>
            <p className="flex justify-between text-ink-muted">
              <span>− Litros abastecidos</span>
              <span className="tabular-nums">{Number.isFinite(litersNumber) ? formatNumber(litersNumber) : 0} L</span>
            </p>
            <div className="my-1.5 border-t border-border-strong" />
            <p className="flex justify-between font-medium text-ink">
              <span>Novo estoque (estimado)</span>
              <span className="tabular-nums">{previewNewStock !== null ? formatNumber(previewNewStock) : '—'} L</span>
            </p>
            {previewNewStock !== null && previewNewStock < 0 && (
              <p className="mt-1.5 text-xs text-danger-600">Litros acima do estoque disponível — o servidor rejeitará o registro.</p>
            )}
            <p className="mt-2 text-xs text-ink-subtle">O valor exibido é apenas informativo. O backend continua sendo a autoridade sobre o saldo real.</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
