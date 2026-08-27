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
import { createQuotation, updateQuotation } from '../../lib/api/quotations.api';
import { listCustomerContacts, listCustomers, listLocations } from '../../lib/api/trips.api';
import { VEHICLE_TYPE_LABELS, labelOrValue } from '../../lib/labels';
import type { QuotationEntity } from '../../types/entities';
import { VehicleType } from '../../types/enums';
import { formatDateInputValue } from '../../utils/format';

const numberField = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))
  .optional();

const schema = z.object({
  customerId: z.string().uuid('Selecione o cliente.'),
  customerContactId: z.union([z.string().uuid(), z.literal('')]).optional(),
  originLocationId: z.string().uuid('Selecione a origem.'),
  destinationLocationId: z.string().uuid('Selecione o destino.'),
  cargoType: z.string().optional(),
  weightKg: numberField,
  cubageM3: numberField,
  vehicleType: z.union([z.nativeEnum(VehicleType), z.literal('')]).optional(),
  conditions: z.string().optional(),
  validUntil: z.string().min(1, 'Informe a validade da cotação.'),
  manualAmount: numberField,
});

type FormValues = z.infer<typeof schema>;

// Fase 94 -- criar/editar cotacao (mesmo padrao create+edit de
// ContractFormModal/CustomerFormModal). manualAmount e sempre opcional: se
// omitido, o backend tenta calcular automaticamente pelo motor de
// precificacao existente; se nao houver tabela/regra aplicavel, o backend
// recusa com 409 explicando o motivo -- o usuario entao preenche
// manualAmount e reenvia (nenhuma logica de calculo duplicada aqui).
export function QuotationFormModal({
  open,
  onClose,
  quotation,
  defaultCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  quotation?: QuotationEntity | null;
  defaultCustomerId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(quotation);
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const customerId = watch('customerId');

  useEffect(() => {
    if (open) {
      reset({
        customerId: quotation?.customerId ?? defaultCustomerId ?? '',
        customerContactId: quotation?.customerContactId ?? '',
        originLocationId: quotation?.originLocationId ?? '',
        destinationLocationId: quotation?.destinationLocationId ?? '',
        cargoType: quotation?.cargoType ?? '',
        weightKg: quotation?.weightKg ?? undefined,
        cubageM3: quotation?.cubageM3 ?? undefined,
        vehicleType: quotation?.vehicleType ?? '',
        conditions: quotation?.conditions ?? '',
        validUntil: formatDateInputValue(quotation?.validUntil) || '',
        manualAmount: undefined,
      });
    }
  }, [open, quotation, defaultCustomerId, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        customerId: values.customerId,
        customerContactId: values.customerContactId || undefined,
        originLocationId: values.originLocationId,
        destinationLocationId: values.destinationLocationId,
        cargoType: values.cargoType || undefined,
        weightKg: values.weightKg,
        cubageM3: values.cubageM3,
        vehicleType: values.vehicleType || undefined,
        conditions: values.conditions || undefined,
        validUntil: new Date(values.validUntil).toISOString(),
        manualAmount: values.manualAmount,
      };
      return isEdit && quotation ? updateQuotation(quotation.id, payload) : createQuotation(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Cotação atualizada.' : 'Cotação criada.');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      onClose();
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar a cotação.' : 'Não foi possível criar a cotação.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar cotação' : 'Nova cotação'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            {isEdit ? 'Salvar' : 'Criar cotação'}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Cliente" htmlFor="quo-customer" required error={errors.customerId?.message}>
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="quo-customer"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={Boolean(defaultCustomerId) || isEdit}
                invalid={Boolean(errors.customerId)}
              />
            )}
          />
        </FormField>

        <FormField label="Contato solicitante" htmlFor="quo-contact" hint="Opcional">
          <Controller
            control={control}
            name="customerContactId"
            render={({ field }) => (
              <EntitySelect
                id="quo-contact"
                queryKey={['customers', customerId, 'contacts-select']}
                queryFn={async () => ({ items: customerId ? await listCustomerContacts(customerId) : [] })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={!customerId}
                placeholder="Nenhum"
              />
            )}
          />
        </FormField>

        <FormField label="Origem" htmlFor="quo-origin" required error={errors.originLocationId?.message}>
          <Controller
            control={control}
            name="originLocationId"
            render={({ field }) => (
              <EntitySelect
                id="quo-origin"
                queryKey={['locations', 'select']}
                queryFn={() => listLocations({ pageSize: 100 })}
                getOptionValue={(l) => l.id}
                getOptionLabel={(l) => l.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.originLocationId)}
              />
            )}
          />
        </FormField>

        <FormField label="Destino" htmlFor="quo-destination" required error={errors.destinationLocationId?.message}>
          <Controller
            control={control}
            name="destinationLocationId"
            render={({ field }) => (
              <EntitySelect
                id="quo-destination"
                queryKey={['locations', 'select']}
                queryFn={() => listLocations({ pageSize: 100 })}
                getOptionValue={(l) => l.id}
                getOptionLabel={(l) => l.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                invalid={Boolean(errors.destinationLocationId)}
              />
            )}
          />
        </FormField>

        <FormField label="Carga/mercadoria" htmlFor="quo-cargo" hint="Opcional">
          <Input id="quo-cargo" {...register('cargoType')} />
        </FormField>

        <FormField label="Tipo de veículo" htmlFor="quo-vehicle-type" hint="Opcional">
          <Select id="quo-vehicle-type" {...register('vehicleType')}>
            <option value="">Qualquer</option>
            {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
              <option key={t} value={t}>
                {labelOrValue(VEHICLE_TYPE_LABELS, t)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Peso (kg)" htmlFor="quo-weight" hint="Opcional">
          <Input id="quo-weight" type="number" min={0} step="0.1" {...register('weightKg')} />
        </FormField>

        <FormField label="Cubagem (m³)" htmlFor="quo-cubage" hint="Opcional">
          <Input id="quo-cubage" type="number" min={0} step="0.01" {...register('cubageM3')} />
        </FormField>

        <FormField label="Validade da cotação" htmlFor="quo-valid-until" required error={errors.validUntil?.message}>
          <Input id="quo-valid-until" type="date" invalid={Boolean(errors.validUntil)} {...register('validUntil')} />
        </FormField>

        <FormField
          label="Valor manual (R$)"
          htmlFor="quo-manual-amount"
          hint="Opcional — deixe em branco para calcular automaticamente pela tabela de frete vigente do cliente."
        >
          <Input id="quo-manual-amount" type="number" min={0} step="0.01" {...register('manualAmount')} />
        </FormField>

        <FormField
          label="Condições e observações"
          htmlFor="quo-conditions"
          className="sm:col-span-2"
          hint="Opcional"
        >
          <textarea
            id="quo-conditions"
            className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('conditions')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
