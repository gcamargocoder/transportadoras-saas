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
import { createProposal, updateProposal } from '../../lib/api/proposals.api';
import { listQuotations } from '../../lib/api/quotations.api';
import { listCustomers } from '../../lib/api/trips.api';
import type { ProposalEntity } from '../../types/entities';
import { formatDateInputValue } from '../../utils/format';

const numberField = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))
  .optional();

const schema = z.object({
  customerId: z.string().uuid('Selecione o cliente.'),
  quotationId: z.union([z.string().uuid(), z.literal('')]).optional(),
  totalAmount: numberField,
  commercialConditions: z.string().optional(),
  notes: z.string().optional(),
  validUntil: z.string().min(1, 'Informe a validade da proposta.'),
});

type FormValues = z.infer<typeof schema>;

// Fase 95 -- criar/editar proposta (edicao so possivel em DRAFT, o backend
// e a autoridade real). Quando quotationId e informado, totalAmount/
// commercialConditions sao herdados do snapshot ja calculado da Quotation
// pelo backend quando deixados em branco -- nunca recalculados aqui.
export function ProposalFormModal({
  open,
  onClose,
  proposal,
  defaultCustomerId,
  defaultQuotationId,
}: {
  open: boolean;
  onClose: () => void;
  proposal?: ProposalEntity | null;
  defaultCustomerId?: string;
  defaultQuotationId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const isEdit = Boolean(proposal);
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
        customerId: proposal?.customerId ?? defaultCustomerId ?? '',
        quotationId: proposal?.quotationId ?? defaultQuotationId ?? '',
        totalAmount: proposal?.totalAmount ?? undefined,
        commercialConditions: proposal?.commercialConditions ?? '',
        notes: proposal?.notes ?? '',
        validUntil: formatDateInputValue(proposal?.validUntil) || '',
      });
    }
  }, [open, proposal, defaultCustomerId, defaultQuotationId, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        customerId: values.customerId,
        quotationId: values.quotationId || undefined,
        totalAmount: values.totalAmount,
        commercialConditions: values.commercialConditions || undefined,
        notes: values.notes || undefined,
        validUntil: new Date(values.validUntil).toISOString(),
      };
      return isEdit && proposal ? updateProposal(proposal.id, payload) : createProposal(payload);
    },
    onSuccess: (result) => {
      toast.success(isEdit ? 'Proposta atualizada.' : 'Proposta criada.');
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      onClose();
      if (!isEdit) router.push(`/proposals/${result.id}`);
    },
    onError: (error) =>
      toast.error(
        isEdit ? 'Não foi possível atualizar a proposta.' : 'Não foi possível criar a proposta.',
        toFriendlyMessage(error),
      ),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar proposta' : 'Nova proposta'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            {isEdit ? 'Salvar' : 'Criar proposta'}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Cliente" htmlFor="prop-customer" required error={errors.customerId?.message}>
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="prop-customer"
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

        <FormField
          label="Cotação de origem"
          htmlFor="prop-quotation"
          hint="Opcional — somente cotações aprovadas do cliente selecionado."
        >
          <Controller
            control={control}
            name="quotationId"
            render={({ field }) => (
              <EntitySelect
                id="prop-quotation"
                queryKey={['quotations', 'select', customerId]}
                queryFn={() => listQuotations({ customerId, status: 'APPROVED', pageSize: 100 })}
                getOptionValue={(q) => q.id}
                getOptionLabel={(q) => `Cotação — ${q.originLocationName ?? '—'} → ${q.destinationLocationName ?? '—'}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={!customerId || Boolean(defaultQuotationId)}
                placeholder="Nenhuma"
              />
            )}
          />
        </FormField>

        <FormField
          label="Valor total (R$)"
          htmlFor="prop-total"
          hint="Obrigatório sem cotação de origem — deixe em branco para herdar o valor da cotação."
          error={errors.totalAmount?.message}
        >
          <Input id="prop-total" type="number" min={0} step="0.01" invalid={Boolean(errors.totalAmount)} {...register('totalAmount')} />
        </FormField>

        <FormField label="Validade da proposta" htmlFor="prop-valid-until" required error={errors.validUntil?.message}>
          <Input id="prop-valid-until" type="date" invalid={Boolean(errors.validUntil)} {...register('validUntil')} />
        </FormField>

        <FormField
          label="Condições comerciais"
          htmlFor="prop-conditions"
          className="sm:col-span-2"
          hint="Opcional — prazo, forma de pagamento etc. Herdado da cotação quando em branco."
        >
          <textarea
            id="prop-conditions"
            className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('commercialConditions')}
          />
        </FormField>

        <FormField label="Observações comerciais" htmlFor="prop-notes" className="sm:col-span-2" hint="Opcional">
          <textarea
            id="prop-notes"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
