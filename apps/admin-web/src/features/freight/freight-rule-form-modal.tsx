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
import { createFreightRule, reviseFreightRule } from '../../lib/api/freight.api';
import { VEHICLE_TYPE_LABELS, labelOrValue } from '../../lib/labels';
import type { FreightRuleEntity } from '../../types/entities';
import { VehicleType } from '../../types/enums';

const numberField = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))
  .refine((v) => v === undefined || (!Number.isNaN(v) && v >= 0), 'Deve ser um número válido (>= 0).')
  .optional();

const schema = z.object({
  originRegion: z.string().optional(),
  destinationRegion: z.string().optional(),
  cargoType: z.string().optional(),
  vehicleType: z.union([z.nativeEnum(VehicleType), z.literal('')]).optional(),
  minWeightKg: numberField,
  maxWeightKg: numberField,
  minCubageM3: numberField,
  maxCubageM3: numberField,
  priority: numberField,
  baseAmount: numberField,
  perKmAmount: numberField,
  perTonAmount: numberField,
  minimumAmount: numberField,
  tollAmount: numberField,
  riskAdditionalAmount: numberField,
  nightAdditionalAmount: numberField,
  dailyRateAmount: numberField,
  demurrageAmount: numberField,
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function toDefaultValues(rule?: FreightRuleEntity | null): FormValues {
  return {
    originRegion: rule?.originRegion ?? '',
    destinationRegion: rule?.destinationRegion ?? '',
    cargoType: rule?.cargoType ?? '',
    vehicleType: rule?.vehicleType ?? '',
    minWeightKg: rule?.minWeightKg ?? undefined,
    maxWeightKg: rule?.maxWeightKg ?? undefined,
    minCubageM3: rule?.minCubageM3 ?? undefined,
    maxCubageM3: rule?.maxCubageM3 ?? undefined,
    priority: rule?.priority ?? 0,
    baseAmount: rule?.baseAmount ?? undefined,
    perKmAmount: rule?.perKmAmount ?? undefined,
    perTonAmount: rule?.perTonAmount ?? undefined,
    minimumAmount: rule?.minimumAmount ?? undefined,
    tollAmount: rule?.tollAmount ?? undefined,
    riskAdditionalAmount: rule?.riskAdditionalAmount ?? undefined,
    nightAdditionalAmount: rule?.nightAdditionalAmount ?? undefined,
    dailyRateAmount: rule?.dailyRateAmount ?? undefined,
    demurrageAmount: rule?.demurrageAmount ?? undefined,
    notes: rule?.notes ?? '',
  };
}

export function FreightRuleFormModal({
  open,
  onClose,
  freightTableId,
  revisingRule,
}: {
  open: boolean;
  onClose: () => void;
  freightTableId?: string;
  revisingRule?: FreightRuleEntity | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isRevision = Boolean(revisingRule);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset(toDefaultValues(isRevision ? revisingRule : null));
  }, [open, isRevision, revisingRule, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        originRegion: values.originRegion || undefined,
        destinationRegion: values.destinationRegion || undefined,
        cargoType: values.cargoType || undefined,
        vehicleType: values.vehicleType || undefined,
        minWeightKg: values.minWeightKg,
        maxWeightKg: values.maxWeightKg,
        minCubageM3: values.minCubageM3,
        maxCubageM3: values.maxCubageM3,
        priority: values.priority,
        baseAmount: values.baseAmount,
        perKmAmount: values.perKmAmount,
        perTonAmount: values.perTonAmount,
        minimumAmount: values.minimumAmount,
        tollAmount: values.tollAmount,
        riskAdditionalAmount: values.riskAdditionalAmount,
        nightAdditionalAmount: values.nightAdditionalAmount,
        dailyRateAmount: values.dailyRateAmount,
        demurrageAmount: values.demurrageAmount,
        notes: values.notes || undefined,
      };
      if (isRevision && revisingRule) return reviseFreightRule(revisingRule.id, payload);
      if (!freightTableId) throw new Error('freightTableId obrigatório para criar uma regra.');
      return createFreightRule({ ...payload, freightTableId });
    },
    onSuccess: () => {
      toast.success(isRevision ? 'Nova versão da regra criada.' : 'Regra criada.');
      queryClient.invalidateQueries({ queryKey: ['freight', 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['freight', 'tables'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isRevision ? 'Não foi possível criar a nova versão.' : 'Não foi possível criar a regra.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRevision ? `Revisar regra (versão ${revisingRule?.version ?? '?'} → nova versão)` : 'Nova regra de frete'}
      description={
        isRevision
          ? 'A versão atual é preservada (arquivada); campos deixados em branco herdam o valor da versão anterior.'
          : 'Todos os critérios são opcionais — preencha apenas o que a regra precisa restringir.'
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            {isRevision ? 'Criar nova versão' : 'Criar regra'}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Critérios (opcionais)</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Região de origem" htmlFor="rule-origin-region">
              <Input id="rule-origin-region" placeholder="Ex: SP" {...register('originRegion')} />
            </FormField>
            <FormField label="Região de destino" htmlFor="rule-destination-region">
              <Input id="rule-destination-region" placeholder="Ex: RJ" {...register('destinationRegion')} />
            </FormField>
            <FormField label="Tipo de carga" htmlFor="rule-cargo-type">
              <Input id="rule-cargo-type" placeholder="Ex: GRANEL" {...register('cargoType')} />
            </FormField>
            <FormField label="Tipo de veículo" htmlFor="rule-vehicle-type">
              <Select id="rule-vehicle-type" {...register('vehicleType')}>
                <option value="">Qualquer</option>
                {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
                  <option key={t} value={t}>
                    {labelOrValue(VEHICLE_TYPE_LABELS, t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Peso mín. (kg)" htmlFor="rule-min-weight">
              <Input id="rule-min-weight" type="number" min={0} step="0.01" {...register('minWeightKg')} />
            </FormField>
            <FormField label="Peso máx. (kg)" htmlFor="rule-max-weight">
              <Input id="rule-max-weight" type="number" min={0} step="0.01" {...register('maxWeightKg')} />
            </FormField>
            <FormField label="Cubagem mín. (m³)" htmlFor="rule-min-cubage">
              <Input id="rule-min-cubage" type="number" min={0} step="0.01" {...register('minCubageM3')} />
            </FormField>
            <FormField label="Cubagem máx. (m³)" htmlFor="rule-max-cubage">
              <Input id="rule-max-cubage" type="number" min={0} step="0.01" {...register('maxCubageM3')} />
            </FormField>
            <FormField label="Prioridade" htmlFor="rule-priority" hint="Desempate quando 2+ regras batem igualmente">
              <Input id="rule-priority" type="number" step="1" {...register('priority')} />
            </FormField>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Composição de valor</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Valor base (R$)" htmlFor="rule-base">
              <Input id="rule-base" type="number" min={0} step="0.01" {...register('baseAmount')} />
            </FormField>
            <FormField label="Valor por km (R$)" htmlFor="rule-per-km">
              <Input id="rule-per-km" type="number" min={0} step="0.01" {...register('perKmAmount')} />
            </FormField>
            <FormField label="Valor por tonelada (R$)" htmlFor="rule-per-ton">
              <Input id="rule-per-ton" type="number" min={0} step="0.01" {...register('perTonAmount')} />
            </FormField>
            <FormField label="Valor mínimo (R$)" htmlFor="rule-minimum">
              <Input id="rule-minimum" type="number" min={0} step="0.01" {...register('minimumAmount')} />
            </FormField>
            <FormField label="Pedágio (R$)" htmlFor="rule-toll">
              <Input id="rule-toll" type="number" min={0} step="0.01" {...register('tollAmount')} />
            </FormField>
            <FormField label="Adicional de risco (R$)" htmlFor="rule-risk">
              <Input id="rule-risk" type="number" min={0} step="0.01" {...register('riskAdditionalAmount')} />
            </FormField>
            <FormField label="Adicional noturno (R$)" htmlFor="rule-night">
              <Input id="rule-night" type="number" min={0} step="0.01" {...register('nightAdditionalAmount')} />
            </FormField>
            <FormField label="Diária (R$)" htmlFor="rule-daily">
              <Input id="rule-daily" type="number" min={0} step="0.01" {...register('dailyRateAmount')} />
            </FormField>
            <FormField label="Estadia (R$)" htmlFor="rule-demurrage">
              <Input id="rule-demurrage" type="number" min={0} step="0.01" {...register('demurrageAmount')} />
            </FormField>
          </div>
          {errors.baseAmount?.message && <p className="mt-1 text-xs text-danger-600">{errors.baseAmount.message}</p>}
        </div>

        <FormField label="Observações" htmlFor="rule-notes">
          <textarea
            id="rule-notes"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
