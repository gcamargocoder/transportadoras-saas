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
import { listFuelStations } from '../../lib/api/fuel.api';
import { registerFuelTankReceipt } from '../../lib/api/fuel-tanks.api';
import type { FuelTankEntity } from '../../types/entities';
import { formatCurrency, formatNumber } from '../../utils/format';

const schema = z.object({
  quantityLiters: z.coerce.number().positive('Informe a quantidade recebida.'),
  pricePerLiter: z.coerce.number().min(0, 'O preço por litro não pode ser negativo.'),
  fuelStationId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  receivedAt: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Secao 9 da Fase 2 -- formulario de "Receber Diesel" na tela de detalhe do
// tanque. O calculo de total/novo saldo aqui e SOMENTE feedback visual
// imediato: o backend (POST /fuel-tanks/:id/receipts) e sempre a autoridade
// (recalcula totalAmount, valida capacidade dentro da transacao).
export function RegisterFuelTankReceiptModal({
  open,
  onClose,
  tank,
}: {
  open: boolean;
  onClose: () => void;
  tank: FuelTankEntity;
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
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const quantityLiters = Number(watch('quantityLiters')) || 0;
  const pricePerLiter = Number(watch('pricePerLiter')) || 0;
  const totalAmount = quantityLiters > 0 && pricePerLiter > 0 ? quantityLiters * pricePerLiter : 0;
  const newStock = tank.currentStockLiters + quantityLiters;
  const exceedsCapacity = quantityLiters > 0 && newStock > tank.capacityLiters;

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      registerFuelTankReceipt(tank.id, {
        quantityLiters: values.quantityLiters,
        pricePerLiter: values.pricePerLiter,
        fuelStationId: values.fuelStationId || undefined,
        invoiceNumber: values.invoiceNumber || undefined,
        receivedAt: values.receivedAt ? new Date(values.receivedAt).toISOString() : undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Entrada de diesel registrada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível registrar a entrada.', toFriendlyMessage(error)),
  });

  function handleClose(): void {
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Receber diesel"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting} disabled={exceedsCapacity}>
            Registrar entrada
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Quantidade (litros)" htmlFor="quantityLiters" required error={errors.quantityLiters?.message}>
          <Input id="quantityLiters" type="number" step="0.001" min="0.001" {...register('quantityLiters')} />
        </FormField>
        <FormField label="Preço por litro (R$)" htmlFor="pricePerLiter" required error={errors.pricePerLiter?.message}>
          <Input id="pricePerLiter" type="number" step="0.0001" min="0" {...register('pricePerLiter')} />
        </FormField>
        <FormField label="Fornecedor" htmlFor="fuelStationId" className="sm:col-span-2" hint="Opcional">
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
                placeholder="Não informado"
              />
            )}
          />
        </FormField>
        <FormField label="Documento / nota fiscal" htmlFor="invoiceNumber" hint="Opcional">
          <Input id="invoiceNumber" {...register('invoiceNumber')} />
        </FormField>
        <FormField label="Data/hora do recebimento" htmlFor="receivedAt" hint="Opcional -- padrão: agora">
          <Input id="receivedAt" type="datetime-local" {...register('receivedAt')} />
        </FormField>
        <FormField label="Observação" htmlFor="notes" className="sm:col-span-2" hint="Opcional">
          <Input id="notes" {...register('notes')} />
        </FormField>

        <div className="sm:col-span-2 rounded-lg border border-border bg-surface-muted p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-subtle">Estoque atual</span>
            <span className="font-medium text-ink">{formatNumber(tank.currentStockLiters)} L</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-subtle">Entrada</span>
            <span className="font-medium text-ink">+ {formatNumber(quantityLiters)} L</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
            <span className="text-ink-subtle">Novo estoque</span>
            <span className={`font-semibold ${exceedsCapacity ? 'text-danger-600' : 'text-ink'}`}>{formatNumber(newStock)} L</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-subtle">Capacidade</span>
            <span className="text-ink-subtle">{formatNumber(tank.capacityLiters)} L</span>
          </div>
          {totalAmount > 0 && (
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-ink-subtle">Valor total</span>
              <span className="font-medium text-ink">{formatCurrency(totalAmount)}</span>
            </div>
          )}
          {exceedsCapacity && (
            <p className="mt-2 text-xs font-medium text-danger-600">
              Essa entrada excede a capacidade do tanque em {formatNumber(newStock - tank.capacityLiters)} L. Reduza a
              quantidade para continuar.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
