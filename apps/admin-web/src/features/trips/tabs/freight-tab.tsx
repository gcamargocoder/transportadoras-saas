'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, DollarSign } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader } from '../../../components/ui/card';
import { EntitySelect } from '../../../components/ui/entity-select';
import { ErrorState } from '../../../components/ui/error-state';
import { FormField } from '../../../components/ui/form-field';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { Select } from '../../../components/ui/select';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  applyFreightRevenue,
  applyFreightToTrip,
  getTripFreight,
  getTripProfitability,
  listContracts,
  updateTripFreight,
} from '../../../lib/api/freight.api';
import { VEHICLE_TYPE_LABELS, labelOrValue } from '../../../lib/labels';
import { VehicleType } from '../../../types/enums';
import { formatCurrency } from '../../../utils/format';
import { BillingSection } from './billing-section';

const numberField = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))
  .optional();

const applySchema = z.object({
  contractId: z.string().optional(),
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
type ApplyFormValues = z.infer<typeof applySchema>;

const editSchema = z.object({
  contractedAmount: numberField,
  finalAmount: numberField,
});
type EditFormValues = z.infer<typeof editSchema>;

function ApplyFreightModal({
  open,
  onClose,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<ApplyFormValues>({ resolver: zodResolver(applySchema) });

  useEffect(() => {
    if (open) reset({});
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: ApplyFormValues) =>
      applyFreightToTrip(tripId, {
        contractId: values.contractId || undefined,
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['freight', 'trip', tripId] });
      if (result.estimatedAmount === null) {
        toast.error('Nenhuma tabela/regra aplicável encontrada.', 'Ajuste os parâmetros ou cadastre uma regra compatível.');
      } else {
        toast.success('Cotação comercial calculada e aplicada à viagem.');
      }
      onClose();
    },
    onError: (error) => toast.error('Não foi possível calcular o frete.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Calcular frete da viagem"
      description="O backend é sempre a fonte da verdade do valor — nada aqui é calculado no navegador."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Calcular e aplicar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Contrato" htmlFor="apply-contract" hint="Opcional — precisa estar ACTIVE e não vencido">
          <Controller
            control={control}
            name="contractId"
            render={({ field }) => (
              <EntitySelect
                id="apply-contract"
                queryKey={['freight', 'contracts', 'select']}
                queryFn={() => listContracts({ pageSize: 100, status: 'ACTIVE' })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => `${c.code} — ${c.customerName ?? ''}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Nenhum"
              />
            )}
          />
        </FormField>
        <FormField label="Tipo de veículo" htmlFor="apply-vehicle-type">
          <Select id="apply-vehicle-type" {...register('vehicleType')}>
            <option value="">Qualquer</option>
            {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
              <option key={t} value={t}>
                {labelOrValue(VEHICLE_TYPE_LABELS, t)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Região de origem" htmlFor="apply-origin-region">
          <Input id="apply-origin-region" {...register('originRegion')} />
        </FormField>
        <FormField label="Região de destino" htmlFor="apply-destination-region">
          <Input id="apply-destination-region" {...register('destinationRegion')} />
        </FormField>
        <FormField label="Tipo de carga" htmlFor="apply-cargo-type">
          <Input id="apply-cargo-type" {...register('cargoType')} />
        </FormField>
        <FormField label="Distância (km)" htmlFor="apply-distance">
          <Input id="apply-distance" type="number" min={0} step="0.1" {...register('distanceKm')} />
        </FormField>
        <FormField label="Peso (kg)" htmlFor="apply-weight">
          <Input id="apply-weight" type="number" min={0} step="0.1" {...register('weightKg')} />
        </FormField>
        <FormField label="Cubagem (m³)" htmlFor="apply-cubage">
          <Input id="apply-cubage" type="number" min={0} step="0.01" {...register('cubageM3')} />
        </FormField>
        <FormField label="Diárias" htmlFor="apply-daily">
          <Input id="apply-daily" type="number" min={0} step="1" {...register('dailyCount')} />
        </FormField>
        <FormField label="Estadias" htmlFor="apply-demurrage">
          <Input id="apply-demurrage" type="number" min={0} step="1" {...register('demurrageCount')} />
        </FormField>
        <div className="flex items-center gap-6 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 rounded border-border" {...register('riskCargo')} />
            Carga com risco
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 rounded border-border" {...register('nightService')} />
            Serviço noturno
          </label>
        </div>
      </form>
    </Modal>
  );
}

function EditAmountsModal({
  open,
  onClose,
  tripId,
  contractedAmount,
  finalAmount,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  contractedAmount: number | null;
  finalAmount: number | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<EditFormValues>({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    if (open) reset({ contractedAmount: contractedAmount ?? undefined, finalAmount: finalAmount ?? undefined });
  }, [open, contractedAmount, finalAmount, reset]);

  const mutation = useMutation({
    mutationFn: (values: EditFormValues) => updateTripFreight(tripId, values),
    onSuccess: () => {
      toast.success('Valores atualizados.');
      queryClient.invalidateQueries({ queryKey: ['freight', 'trip', tripId] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível atualizar os valores.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar valores negociados"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Valor contratado (R$)" htmlFor="edit-contracted" hint="Valor efetivamente negociado com o cliente">
          <Input id="edit-contracted" type="number" min={0} step="0.01" {...register('contractedAmount')} />
        </FormField>
        <FormField label="Valor final (R$)" htmlFor="edit-final" hint="Opcional — valor de fechamento">
          <Input id="edit-final" type="number" min={0} step="0.01" {...register('finalAmount')} />
        </FormField>
      </form>
    </Modal>
  );
}

export function FreightTab({ tripId }: { tripId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const freightQuery = useQuery({
    queryKey: ['freight', 'trip', tripId],
    queryFn: () => getTripFreight(tripId),
  });
  const profitabilityQuery = useQuery({
    queryKey: ['freight', 'trip', tripId, 'profitability'],
    queryFn: () => getTripProfitability(tripId),
  });

  const revenueMutation = useMutation({
    mutationFn: () => applyFreightRevenue(tripId),
    onSuccess: () => {
      toast.success('Receita gerada a partir do valor comercial.');
      queryClient.invalidateQueries({ queryKey: ['freight', 'trip', tripId] });
      queryClient.invalidateQueries({ queryKey: ['trip-revenues'] });
    },
    onError: (error) => toast.error('Não foi possível gerar a receita.', toFriendlyMessage(error)),
  });

  if (freightQuery.isLoading) return <p className="p-5 text-sm text-ink-subtle">Carregando…</p>;
  if (freightQuery.isError) return <ErrorState onRetry={() => freightQuery.refetch()} />;

  const freight = freightQuery.data;

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-subtle">
          Contrato/tabela/regra/valores comerciais aplicados à viagem. O valor histórico nunca muda retroativamente
          mesmo que a regra usada seja revisada depois.
        </p>
        <Button onClick={() => setApplyOpen(true)}>
          <Calculator size={16} />
          {freight ? 'Recalcular' : 'Calcular frete'}
        </Button>
      </div>

      {!freight && (
        <Card>
          <div className="p-8 text-center text-sm text-ink-subtle">
            Nenhuma cotação comercial aplicada a esta viagem ainda.
          </div>
        </Card>
      )}

      {freight && (
        <>
          <Card>
            <CardHeader
              title="Cotação comercial"
              description={`Contrato: ${freight.contractCode ?? '—'} · Tabela: ${freight.freightTableName ?? '—'} · Regra: ${freight.freightRuleVersion ? `v${freight.freightRuleVersion}` : '—'}`}
              action={
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  Editar valores
                </Button>
              }
            />
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <StatCard label="Base" value={formatCurrency(freight.baseAmount)} />
              <StatCard label="Adicionais" value={formatCurrency(freight.additionsAmount)} />
              <StatCard label="Pedágio" value={formatCurrency(freight.tollAmount)} />
              <StatCard label="Taxas" value={formatCurrency(freight.feesAmount)} />
              <StatCard label="Valor estimado" value={formatCurrency(freight.estimatedAmount)} tone="info" />
              <StatCard label="Valor contratado" value={freight.contractedAmount !== null ? formatCurrency(freight.contractedAmount) : '—'} tone="brand" />
              <StatCard label="Valor final" value={freight.finalAmount !== null ? formatCurrency(freight.finalAmount) : '—'} />
              <StatCard
                label="Receita gerada"
                value={freight.revenueId ? 'Sim' : 'Não'}
                {...(freight.revenueId ? { tone: 'success' as const } : {})}
              />
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <p className="text-xs text-ink-subtle">
                {freight.revenueId
                  ? 'Receita já registrada a partir deste valor — nunca duplicada.'
                  : 'Gerar receita usa o valor contratado (ou final/estimado, se ausente) como referência.'}
              </p>
              <Button
                variant="outline"
                onClick={() => revenueMutation.mutate()}
                disabled={Boolean(freight.revenueId)}
                loading={revenueMutation.isPending}
              >
                <DollarSign size={16} />
                Gerar receita
              </Button>
            </div>
          </Card>

          {profitabilityQuery.data && (
            <Card>
              <CardHeader title="Rentabilidade" description="Reaproveita o financeiro da viagem (Fase 51) — nenhum custo recalculado aqui." />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <StatCard
                  label="Contratado"
                  value={profitabilityQuery.data.contractedAmountAvailable ? formatCurrency(profitabilityQuery.data.contractedAmount) : '—'}
                />
                <StatCard label="Receita realizada" value={formatCurrency(profitabilityQuery.data.realizedRevenue)} />
                <StatCard label="Custo realizado" value={formatCurrency(profitabilityQuery.data.realizedCost)} />
                <StatCard
                  label="Margem prevista"
                  value={profitabilityQuery.data.projectedMargin !== null ? formatCurrency(profitabilityQuery.data.projectedMargin) : '—'}
                  tone="info"
                />
                <StatCard label="Resultado real" value={formatCurrency(profitabilityQuery.data.realResult)} tone="info" />
                <StatCard
                  label="Diferença previsto × realizado"
                  value={profitabilityQuery.data.resultDifference !== null ? formatCurrency(profitabilityQuery.data.resultDifference) : '—'}
                />
              </div>
            </Card>
          )}

          <BillingSection tripId={tripId} />

          {freight.calculationInput && Object.keys(freight.calculationInput).length > 0 && (
            <div className="flex flex-wrap gap-1">
              <Badge tone="neutral">Parâmetros do último cálculo:</Badge>
              {Object.entries(freight.calculationInput)
                .filter(([, v]) => v !== null && v !== undefined && v !== false)
                .map(([k, v]) => (
                  <Badge key={k} tone="neutral">{`${k}: ${String(v)}`}</Badge>
                ))}
            </div>
          )}
        </>
      )}

      <ApplyFreightModal open={applyOpen} onClose={() => setApplyOpen(false)} tripId={tripId} />
      {freight && (
        <EditAmountsModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          tripId={tripId}
          contractedAmount={freight.contractedAmount}
          finalAmount={freight.finalAmount}
        />
      )}
    </div>
  );
}
