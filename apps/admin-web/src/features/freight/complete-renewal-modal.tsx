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
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { completeContractRenewal } from '../../lib/api/contract-renewals.api';
import type { ContractRenewalEntity } from '../../types/entities';

const schema = z.object({
  code: z.string().min(1, 'Informe o código do novo contrato.'),
  startDate: z.string().min(1, 'Informe a data inicial da nova vigência.'),
  endDate: z.string().optional(),
  description: z.string().optional(),
  commercialTerms: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Fase 98 -- conclui a renovacao: cria o NOVO Contract (via
// ContractsService.create no backend, nunca um segundo sistema de
// contratos), ativa-o e marca o anterior como EXPIRED. Campos deixados em
// branco aqui sao herdados do contrato anterior automaticamente.
export function CompleteRenewalModal({
  open,
  onClose,
  renewal,
}: {
  open: boolean;
  onClose: () => void;
  renewal: ContractRenewalEntity | null;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        code: '',
        startDate: '',
        endDate: '',
        description: '',
        commercialTerms: '',
        notes: '',
      });
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      completeContractRenewal(renewal?.id as string, {
        code: values.code,
        startDate: new Date(values.startDate).toISOString(),
        endDate: values.endDate ? new Date(values.endDate).toISOString() : undefined,
        description: values.description || undefined,
        commercialTerms: values.commercialTerms || undefined,
        notes: values.notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Renovação concluída — novo contrato criado e ativado.');
      queryClient.invalidateQueries({ queryKey: ['contract-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['freight', 'contracts'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível concluir a renovação.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Concluir renovação"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Concluir renovação
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <p className="text-sm text-ink-muted sm:col-span-2">
          Contrato anterior <span className="font-medium text-ink">{renewal?.previousContractCode}</span>. Campos
          deixados em branco abaixo são herdados do contrato anterior; o contrato anterior nunca é alterado além do
          status (passa a EXPIRED).
        </p>
        <FormField label="Código do novo contrato" htmlFor="renewal-code" required error={errors.code?.message}>
          <Input id="renewal-code" invalid={Boolean(errors.code)} {...register('code')} />
        </FormField>
        <div />
        <FormField label="Início da nova vigência" htmlFor="renewal-start" required error={errors.startDate?.message}>
          <Input id="renewal-start" type="date" invalid={Boolean(errors.startDate)} {...register('startDate')} />
        </FormField>
        <FormField label="Fim da nova vigência" htmlFor="renewal-end" hint="Opcional — sem término definido quando vazio">
          <Input id="renewal-end" type="date" {...register('endDate')} />
        </FormField>
        <FormField label="Descrição" htmlFor="renewal-description" className="sm:col-span-2" hint="Opcional — herdado se vazio">
          <Input id="renewal-description" {...register('description')} />
        </FormField>
        <FormField
          label="Condições comerciais"
          htmlFor="renewal-terms"
          className="sm:col-span-2"
          hint="Opcional — herdado se vazio"
        >
          <textarea
            id="renewal-terms"
            className="min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('commercialTerms')}
          />
        </FormField>
        <FormField label="Observações" htmlFor="renewal-notes-complete" className="sm:col-span-2" hint="Opcional — herdado se vazio">
          <textarea
            id="renewal-notes-complete"
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            {...register('notes')}
          />
        </FormField>
      </form>
    </Modal>
  );
}
