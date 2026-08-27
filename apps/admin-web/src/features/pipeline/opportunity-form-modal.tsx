'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createPipelineOpportunity, updatePipelineOpportunity } from '../../lib/api/pipeline.api';
import { listProposals } from '../../lib/api/proposals.api';
import { listQuotations } from '../../lib/api/quotations.api';
import { listCustomers } from '../../lib/api/trips.api';
import type { PipelineOpportunityEntity } from '../../types/entities';

const numberField = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))
  .optional();

const schema = z.object({
  customerId: z.string().uuid('Selecione o cliente.'),
  quotationId: z.union([z.string().uuid(), z.literal('')]).optional(),
  proposalId: z.union([z.string().uuid(), z.literal('')]).optional(),
  title: z.string().optional(),
  estimatedValue: numberField,
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Fase 96 -- criar/editar oportunidade. estimatedValue e herdado da
// proposta/cotacao vinculada pelo backend quando deixado em branco -- nunca
// recalculado aqui. O estagio nunca muda por este formulario (ver
// MoveStageMenu/MoveStageModal).
export function OpportunityFormModal({
  open,
  onClose,
  opportunity,
  defaultCustomerId,
  defaultQuotationId,
  defaultProposalId,
}: {
  open: boolean;
  onClose: () => void;
  opportunity?: PipelineOpportunityEntity | null;
  defaultCustomerId?: string;
  defaultQuotationId?: string;
  defaultProposalId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const isEdit = Boolean(opportunity);
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
        customerId: opportunity?.customerId ?? defaultCustomerId ?? '',
        quotationId: opportunity?.quotationId ?? defaultQuotationId ?? '',
        proposalId: opportunity?.proposalId ?? defaultProposalId ?? '',
        title: opportunity?.title ?? '',
        estimatedValue: opportunity?.estimatedValue ?? undefined,
        notes: opportunity?.notes ?? '',
      });
    }
  }, [open, opportunity, defaultCustomerId, defaultQuotationId, defaultProposalId, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        customerId: values.customerId,
        quotationId: values.quotationId || undefined,
        proposalId: values.proposalId || undefined,
        title: values.title || undefined,
        estimatedValue: values.estimatedValue,
        notes: values.notes || undefined,
      };
      return isEdit && opportunity ? updatePipelineOpportunity(opportunity.id, payload) : createPipelineOpportunity(payload);
    },
    onSuccess: (result) => {
      toast.success(isEdit ? 'Oportunidade atualizada.' : 'Oportunidade criada.');
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      onClose();
      if (!isEdit) router.push(`/operations/commercial/pipeline/${result.id}`);
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar a oportunidade.' : 'Não foi possível criar a oportunidade.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar oportunidade' : 'Nova oportunidade'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            {isEdit ? 'Salvar' : 'Criar oportunidade'}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Cliente" htmlFor="opp-customer" required error={errors.customerId?.message} className="sm:col-span-2">
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="opp-customer"
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

        <FormField label="Cotação relacionada" htmlFor="opp-quotation" hint="Opcional">
          <Controller
            control={control}
            name="quotationId"
            render={({ field }) => (
              <EntitySelect
                id="opp-quotation"
                queryKey={['quotations', 'select', customerId]}
                queryFn={() => listQuotations({ customerId, pageSize: 100 })}
                getOptionValue={(q) => q.id}
                getOptionLabel={(q) => `${q.originLocationName ?? '—'} → ${q.destinationLocationName ?? '—'}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={!customerId || Boolean(defaultQuotationId)}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>

        <FormField label="Proposta relacionada" htmlFor="opp-proposal" hint="Opcional">
          <Controller
            control={control}
            name="proposalId"
            render={({ field }) => (
              <EntitySelect
                id="opp-proposal"
                queryKey={['proposals', 'select', customerId]}
                queryFn={() => listProposals({ customerId, pageSize: 100 })}
                getOptionValue={(p) => p.id}
                getOptionLabel={(p) => `Proposta #${p.number}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={!customerId || Boolean(defaultProposalId)}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>

        <FormField label="Título" htmlFor="opp-title" hint="Opcional">
          <Input id="opp-title" {...register('title')} />
        </FormField>

        <FormField
          label="Valor estimado (R$)"
          htmlFor="opp-estimated-value"
          hint="Opcional — herdado da proposta/cotação vinculada quando em branco."
        >
          <Input id="opp-estimated-value" type="number" min={0} step="0.01" {...register('estimatedValue')} />
        </FormField>

        <FormField label="Observações" htmlFor="opp-notes" className="sm:col-span-2" hint="Opcional">
          <textarea
            id="opp-notes"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
