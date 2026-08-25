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
import { updateMaintenance } from '../../lib/api/fleet.api';
import { listMaintenanceProviders } from '../../lib/api/maintenance-providers.api';
import { MAINTENANCE_COMPONENT_LABELS, MAINTENANCE_TYPE_LABELS } from '../../lib/labels';
import type { MaintenanceEntity } from '../../types/entities';
import type { MaintenanceComponent } from '../../types/enums';

const COMPONENT_VALUES = Object.keys(MAINTENANCE_COMPONENT_LABELS) as [string, ...string[]];

const schema = z.object({
  type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'EMERGENCY', 'OTHER']),
  component: z.enum(COMPONENT_VALUES).optional().or(z.literal('')),
  scheduledAt: z.string().optional(),
  workshop: z.string().optional(),
  supplier: z.string().optional(),
  mechanic: z.string().optional(),
  workshopId: z.string().uuid().optional().or(z.literal('')),
  supplierId: z.string().uuid().optional().or(z.literal('')),
  description: z.string().optional(),
  laborCost: z.coerce.number().optional(),
  partsCost: z.coerce.number().optional(),
});

type FormValues = z.infer<typeof schema>;

// Fase 63 -- "editar enquanto permitido" (secao 5 do pedido): reaproveita
// PATCH /maintenances/:id ja existente no backend, nunca duplica logica de
// calculo de totalCost (sempre derivado no service a partir de laborCost/
// partsCost). vehicleId nunca e editavel aqui de proposito -- reatribuir o
// veiculo de uma manutencao ja aberta e uma operacao de correcao de
// cadastro, fora do escopo desta tela de edicao rapida.
export function UpdateMaintenanceModal({
  open,
  onClose,
  maintenance,
}: {
  open: boolean;
  onClose: () => void;
  maintenance: MaintenanceEntity;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset({
        type: maintenance.type,
        component: maintenance.component ?? '',
        scheduledAt: maintenance.scheduledAt ? maintenance.scheduledAt.slice(0, 10) : '',
        workshop: maintenance.workshop ?? '',
        supplier: maintenance.supplier ?? '',
        mechanic: maintenance.mechanic ?? '',
        workshopId: maintenance.workshopId ?? '',
        supplierId: maintenance.supplierId ?? '',
        description: maintenance.description ?? '',
        laborCost: maintenance.laborCost ?? undefined,
        partsCost: maintenance.partsCost ?? undefined,
      });
    }
  }, [open, maintenance, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateMaintenance(maintenance.id, {
        ...values,
        component: values.component ? (values.component as MaintenanceComponent) : undefined,
        scheduledAt: values.scheduledAt ? values.scheduledAt : undefined,
        workshopId: values.workshopId || undefined,
        supplierId: values.supplierId || undefined,
      }),
    onSuccess: () => {
      toast.success('Manutenção atualizada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar a manutenção.', toFriendlyMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar manutenção"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((values) => mutation.mutate(values))} loading={isSubmitting}>
            Salvar alterações
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Tipo" htmlFor="type" required>
          <Select id="type" {...register('type')}>
            {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Componente" htmlFor="component" hint="Opcional">
          <Select id="component" {...register('component')}>
            <option value="">Não informado</option>
            {Object.entries(MAINTENANCE_COMPONENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Data programada" htmlFor="scheduledAt" hint="Opcional">
          <Input id="scheduledAt" type="date" {...register('scheduledAt')} />
        </FormField>
        <FormField label="Oficina (catálogo)" htmlFor="workshopId" hint="Opcional">
          <Controller
            control={control}
            name="workshopId"
            render={({ field }) => (
              <EntitySelect
                id="workshopId"
                queryKey={['maintenance-providers', 'select', 'WORKSHOP']}
                queryFn={() => listMaintenanceProviders({ type: 'WORKSHOP', isActive: true, pageSize: 100 })}
                getOptionValue={(p) => p.id}
                getOptionLabel={(p) => p.name}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
        <FormField label="Fornecedor (catálogo)" htmlFor="supplierId" hint="Opcional">
          <Controller
            control={control}
            name="supplierId"
            render={({ field }) => (
              <EntitySelect
                id="supplierId"
                queryKey={['maintenance-providers', 'select', 'SUPPLIER']}
                queryFn={() => listMaintenanceProviders({ type: 'SUPPLIER', isActive: true, pageSize: 100 })}
                getOptionValue={(p) => p.id}
                getOptionLabel={(p) => p.name}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        </FormField>
        <FormField label="Oficina (texto livre)" htmlFor="workshop" hint="Opcional">
          <Input id="workshop" {...register('workshop')} />
        </FormField>
        <FormField label="Fornecedor (texto livre)" htmlFor="supplier" hint="Opcional">
          <Input id="supplier" {...register('supplier')} />
        </FormField>
        <FormField label="Mecânico" htmlFor="mechanic" hint="Opcional">
          <Input id="mechanic" {...register('mechanic')} />
        </FormField>
        <FormField label="Custo de mão de obra (R$)" htmlFor="laborCost" hint="Opcional">
          <Input id="laborCost" type="number" step="0.01" {...register('laborCost')} />
        </FormField>
        <FormField label="Custo de peças (R$)" htmlFor="partsCost" hint="Opcional">
          <Input id="partsCost" type="number" step="0.01" {...register('partsCost')} />
        </FormField>
        <FormField label="Descrição" htmlFor="description" className="sm:col-span-2" hint="Opcional">
          <Input id="description" {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
