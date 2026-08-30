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
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listCustomers } from '../../lib/api/trips.api';
import { createReceivable } from '../../lib/api/receivables.api';

const schema = z.object({
  customerId: z.string().min(1, 'Selecione o cliente.'),
  description: z.string().min(1, 'Informe a descrição.'),
  originalAmount: z.coerce.number().positive('Informe um valor maior que zero.'),
  issueDate: z.string().min(1, 'Informe a competência.'),
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  installments: z.coerce.number().int().min(1).max(360).optional(),
});
type FormValues = z.infer<typeof schema>;

// POST /receivables -- titulo MANUAL, sem viagem/faturamento de origem
// (servico avulso, locacao, ressarcimento etc.). Espelha CreateReceivableDto.
// initialValues/fiscalDocumentId (Fase Fiscal/XML) -- mesmo principio de
// CreatePayableModal: autopreenchimento a partir de um documento fiscal ja
// importado, sempre revisado/confirmado pelo usuario antes de criar.
export function CreateReceivableModal({
  open,
  onClose,
  initialValues,
  fiscalDocumentId,
}: {
  open: boolean;
  onClose: () => void;
  initialValues?: Partial<FormValues> | undefined;
  fiscalDocumentId?: string | undefined;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initialValues ?? {} });

  // Dispara so quando o modal abre -- nunca reexecuta so porque
  // initialValues mudou de referencia enquanto ja esta aberto (evitaria o
  // usuario editar o form e ve-lo resetado sozinho).
  useEffect(() => {
    if (open) reset(initialValues ?? {});
  }, [open]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createReceivable({
        ...values,
        issueDate: new Date(values.issueDate).toISOString(),
        dueDate: new Date(values.dueDate).toISOString(),
        installments: fiscalDocumentId ? undefined : values.installments || undefined,
        fiscalDocumentId,
      }),
    onSuccess: (created) => {
      toast.success(
        created.length > 1 ? `${created.length} parcelas criadas.` : 'Conta a receber criada.',
      );
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      if (fiscalDocumentId) queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      reset(initialValues ?? {});
      onClose();
    },
    onError: (error) => toast.error('Não foi possível criar a conta a receber.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset(initialValues ?? {});
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova conta a receber"
      description={
        fiscalDocumentId
          ? 'Dados pré-preenchidos a partir do documento fiscal importado — revise antes de criar.'
          : 'Cria um título manual, sem vínculo com uma viagem (ex: serviço avulso, locação, ressarcimento).'
      }
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Criar
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Cliente" htmlFor="receivable-create-customer" required error={errors.customerId?.message} className="sm:col-span-2">
          <Controller
            control={control}
            name="customerId"
            render={({ field }) => (
              <EntitySelect
                id="receivable-create-customer"
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
        <FormField label="Descrição" htmlFor="receivable-create-description" required error={errors.description?.message} className="sm:col-span-2">
          <Input id="receivable-create-description" invalid={Boolean(errors.description)} {...register('description')} />
        </FormField>
        <FormField label="Valor (R$)" htmlFor="receivable-create-amount" required error={errors.originalAmount?.message}>
          <Input
            id="receivable-create-amount"
            type="number"
            step="0.01"
            min={0.01}
            invalid={Boolean(errors.originalAmount)}
            {...register('originalAmount')}
          />
        </FormField>
        {!fiscalDocumentId && (
          <FormField
            label="Parcelas"
            htmlFor="receivable-create-installments"
            hint="Opcional — padrão 1 (à vista)"
            error={errors.installments?.message}
          >
            <Input id="receivable-create-installments" type="number" step="1" min={1} max={360} {...register('installments')} />
          </FormField>
        )}
        <FormField label="Competência" htmlFor="receivable-create-issue-date" required error={errors.issueDate?.message}>
          <Input id="receivable-create-issue-date" type="date" invalid={Boolean(errors.issueDate)} {...register('issueDate')} />
        </FormField>
        <FormField
          label="Vencimento"
          htmlFor="receivable-create-due-date"
          required
          hint="Quando parcelado, é o vencimento da 1ª parcela"
          error={errors.dueDate?.message}
        >
          <Input id="receivable-create-due-date" type="date" invalid={Boolean(errors.dueDate)} {...register('dueDate')} />
        </FormField>
      </form>
    </Modal>
  );
}
