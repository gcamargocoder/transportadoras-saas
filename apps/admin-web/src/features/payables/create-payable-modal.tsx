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
import { createPayable } from '../../lib/api/payables.api';
import { EXPENSE_CATEGORY_LABELS } from '../../lib/labels';

const schema = z.object({
  supplierName: z.string().optional(),
  category: z.enum(['FUEL', 'FOOD', 'HOTEL', 'TOLL_EXTRA', 'MAINTENANCE', 'TIRES', 'PARKING', 'WASH', 'ADVANCE', 'FINE', 'OTHER']),
  description: z.string().min(1, 'Informe a descrição.'),
  originalAmount: z.coerce.number().positive('Informe um valor maior que zero.'),
  issueDate: z.string().min(1, 'Informe a competência.'),
  dueDate: z.string().min(1, 'Informe o vencimento.'),
  installments: z.coerce.number().int().min(1).max(360).optional(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY_DEFAULTS: Partial<FormValues> = { category: 'OTHER' };

// POST /payables -- titulo MANUAL, sem viagem/despesa de origem (aluguel,
// seguro, fornecedor administrativo etc.). Espelha CreatePayableDto.
// initialValues/fiscalDocumentId (Fase Fiscal/XML) -- autopreenchimento a
// partir de um documento fiscal ja importado (valor/emitente/data extraidos
// do XML); o usuario sempre revisa e confirma antes de criar, nunca uma
// escrita automatica. Quando fiscalDocumentId esta presente, parcelamento
// nao se aplica (1 documento = 1 titulo, ver CreatePayableDto no backend).
export function CreatePayableModal({
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
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY_DEFAULTS, ...initialValues },
  });

  // Reaplica o autopreenchimento sempre que o modal reabre com um documento
  // fiscal diferente (o form nao remonta -- Modal so alterna visibilidade).
  // Dispara so quando o modal abre -- nunca reexecuta so porque
  // initialValues mudou de referencia enquanto ja esta aberto (evitaria o
  // usuario editar o form e ve-lo resetado sozinho).
  useEffect(() => {
    if (open) reset({ ...EMPTY_DEFAULTS, ...initialValues });
  }, [open]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createPayable({
        ...values,
        issueDate: new Date(values.issueDate).toISOString(),
        dueDate: new Date(values.dueDate).toISOString(),
        supplierName: values.supplierName || undefined,
        installments: fiscalDocumentId ? undefined : values.installments || undefined,
        fiscalDocumentId,
      }),
    onSuccess: (created) => {
      toast.success(
        created.length > 1 ? `${created.length} parcelas criadas.` : 'Conta a pagar criada.',
      );
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      if (fiscalDocumentId) queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      reset({ ...EMPTY_DEFAULTS, ...initialValues });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível criar a conta a pagar.', toFriendlyMessage(error)),
  });

  function handleClose() {
    reset({ ...EMPTY_DEFAULTS, ...initialValues });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova conta a pagar"
      description={
        fiscalDocumentId
          ? 'Dados pré-preenchidos a partir do documento fiscal importado — revise antes de criar.'
          : 'Cria um título manual, sem vínculo com uma viagem (ex: aluguel, seguro, fornecedor administrativo).'
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
        <FormField label="Fornecedor" htmlFor="payable-create-supplier" hint="Opcional" className="sm:col-span-2">
          <Input id="payable-create-supplier" {...register('supplierName')} />
        </FormField>
        <FormField label="Categoria" htmlFor="payable-create-category" required>
          <Select id="payable-create-category" {...register('category')}>
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Descrição" htmlFor="payable-create-description" required error={errors.description?.message}>
          <Input id="payable-create-description" invalid={Boolean(errors.description)} {...register('description')} />
        </FormField>
        <FormField label="Valor (R$)" htmlFor="payable-create-amount" required error={errors.originalAmount?.message}>
          <Input
            id="payable-create-amount"
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
            htmlFor="payable-create-installments"
            hint="Opcional — padrão 1 (à vista)"
            error={errors.installments?.message}
          >
            <Input id="payable-create-installments" type="number" step="1" min={1} max={360} {...register('installments')} />
          </FormField>
        )}
        <FormField label="Competência" htmlFor="payable-create-issue-date" required error={errors.issueDate?.message}>
          <Input id="payable-create-issue-date" type="date" invalid={Boolean(errors.issueDate)} {...register('issueDate')} />
        </FormField>
        <FormField
          label="Vencimento"
          htmlFor="payable-create-due-date"
          required
          hint="Quando parcelado, é o vencimento da 1ª parcela"
          error={errors.dueDate?.message}
        >
          <Input id="payable-create-due-date" type="date" invalid={Boolean(errors.dueDate)} {...register('dueDate')} />
        </FormField>
      </form>
    </Modal>
  );
}
