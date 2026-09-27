'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { registerFuelTankInventoryCheck } from '../../lib/api/fuel-tanks.api';
import type { FuelTankEntity } from '../../types/entities';
import { formatNumber } from '../../utils/format';

const schema = z.object({
  measuredStockLiters: z.coerce.number().min(0, 'A medição não pode ser negativa.'),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Secao 11 da Fase 4 -- "Conferir estoque" na tela de detalhe do tanque.
// O estoque teorico exibido aqui vem do proprio tank ja carregado (fonte de
// verdade); o backend LE o teorico de novo no momento do POST (nunca aceita
// o valor mostrado aqui) -- a previa e so feedback visual imediato.
export function CheckFuelTankInventoryModal({
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
    watch,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const measuredRaw = watch('measuredStockLiters');
  const hasMeasurement = measuredRaw !== undefined && measuredRaw !== null && `${measuredRaw}` !== '';
  const measuredStockLiters = Number(measuredRaw) || 0;
  const divergenceLiters = hasMeasurement ? Math.round((measuredStockLiters - tank.currentStockLiters) * 1000) / 1000 : 0;
  const hasDivergence = hasMeasurement && divergenceLiters !== 0;
  const divergencePercent = tank.currentStockLiters !== 0 ? (divergenceLiters / tank.currentStockLiters) * 100 : null;

  const mutation = useMutation({
    mutationFn: (values: FormValues & { applyAdjustment: boolean }) =>
      registerFuelTankInventoryCheck(tank.id, {
        measuredStockLiters: values.measuredStockLiters,
        applyAdjustment: values.applyAdjustment,
        notes: values.notes || undefined,
      }),
    onSuccess: (result) => {
      toast.success(
        result.check.adjusted
          ? 'Ajuste aplicado com sucesso.'
          : result.check.divergenceLiters === 0
            ? 'Estoque conferido -- sem divergência.'
            : 'Conferência registrada.',
      );
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks'] });
      reset();
      onClose();
    },
    onError: (error) => toast.error('Não foi possível registrar a conferência.', toFriendlyMessage(error)),
  });

  function handleClose(): void {
    reset();
    onClose();
  }

  const onRecordOnly = handleSubmit((values) => mutation.mutate({ ...values, applyAdjustment: false }));
  const onConfirmAdjustment = handleSubmit((values) => {
    if (!values.notes?.trim()) {
      setError('notes', { message: 'Informe o motivo da divergência para confirmar o ajuste.' });
      return;
    }
    clearErrors('notes');
    mutation.mutate({ ...values, applyAdjustment: true });
  });

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Conferir estoque"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          {hasDivergence && (
            <Button variant="outline" onClick={onRecordOnly} loading={isSubmitting}>
              Registrar sem ajustar
            </Button>
          )}
          <Button onClick={hasDivergence ? onConfirmAdjustment : onRecordOnly} loading={isSubmitting}>
            {hasDivergence ? 'Confirmar ajuste' : 'Registrar conferência'}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Estoque teórico" htmlFor="theoretical" hint="Calculado a partir do ledger do tanque.">
          <Input id="theoretical" value={`${formatNumber(tank.currentStockLiters)} L`} disabled readOnly />
        </FormField>
        <FormField
          label="Medição física (litros)"
          htmlFor="measuredStockLiters"
          required
          error={errors.measuredStockLiters?.message}
        >
          <Input id="measuredStockLiters" type="number" step="0.001" min="0" {...register('measuredStockLiters')} />
        </FormField>

        {hasDivergence && (
          <FormField
            label="Motivo da divergência"
            htmlFor="notes"
            error={errors.notes?.message}
            hint="Obrigatório para confirmar o ajuste."
          >
            <Input id="notes" {...register('notes')} />
          </FormField>
        )}

        {hasMeasurement && (
          <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-subtle">Estoque teórico</span>
              <span className="font-medium text-ink">{formatNumber(tank.currentStockLiters)} L</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-subtle">Medição física</span>
              <span className="font-medium text-ink">{formatNumber(measuredStockLiters)} L</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
              <span className="text-ink-subtle">Divergência</span>
              <span className={`font-semibold ${hasDivergence ? 'text-warning-600' : 'text-success-600'}`}>
                {divergenceLiters > 0 ? '+' : ''}
                {formatNumber(divergenceLiters)} L
                {divergencePercent !== null && ` (${divergenceLiters > 0 ? '+' : ''}${formatNumber(divergencePercent, 1)}%)`}
              </span>
            </div>
            {hasDivergence ? (
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <span className="text-ink-subtle">Novo estoque após ajuste</span>
                <span className="font-semibold text-ink">{formatNumber(measuredStockLiters)} L</span>
              </div>
            ) : (
              <p className="mt-2 text-xs font-medium text-success-600">Estoque conferido -- sem divergência.</p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
