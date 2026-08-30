'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { updateMaintenance, type MaintenancePartInput } from '../../lib/api/fleet.api';
import { listMaintenanceProviders } from '../../lib/api/maintenance-providers.api';
import { listParts } from '../../lib/api/parts.api';
import { MAINTENANCE_COMPONENT_LABELS, MAINTENANCE_TYPE_LABELS } from '../../lib/labels';
import type { MaintenanceEntity } from '../../types/entities';
import type { MaintenanceComponent } from '../../types/enums';
import { formatCurrency } from '../../utils/format';

// Fase 108 -- fecha a lacuna real ja documentada em docs/parts-inventory.md
// ("sem seletor de peca do catalogo na UI de OS"): o backend ja aceita
// `parts: [{partId?, name, quantity, unitPrice}]` em PATCH /maintenances/:id
// desde a Fase 83 (substitui a lista inteira, recalcula partsCost como a
// soma, consome estoque automaticamente ao concluir a OS quando partId esta
// presente -- MaintenancesService/PartsService.consumePartsForMaintenance,
// nenhuma regra nova) -- so nao havia NENHUMA tela que montasse esse array.
// Estado local simples (nao useFieldArray -- nenhum outro formulario do
// projeto usa esse hook ainda; um array controlado a mao e suficiente aqui e
// evita introduzir um padrao novo so para este caso).
interface PartRow {
  key: string;
  partId: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

function emptyPartRow(): PartRow {
  return { key: crypto.randomUUID(), partId: '', name: '', quantity: '1', unitPrice: '0' };
}

function rowsFromMaintenance(maintenance: MaintenanceEntity): PartRow[] {
  return maintenance.parts.map((p) => ({
    key: p.id,
    partId: p.partId ?? '',
    name: p.name,
    quantity: String(p.quantity),
    unitPrice: String(p.unitPrice),
  }));
}

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
  const [parts, setParts] = useState<PartRow[]>([]);
  const [partsError, setPartsError] = useState<string | null>(null);
  const hadPartsInitially = maintenance.parts.length > 0;

  const partsQuery = useQuery({
    queryKey: ['parts', 'select'],
    queryFn: () => listParts({ pageSize: 100, isActive: true }),
    enabled: open,
  });

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
      setParts(rowsFromMaintenance(maintenance));
      setPartsError(null);
    }
  }, [open, maintenance, reset]);

  const partsTotal = parts.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.unitPrice) || 0), 0);
  // So substitui a lista de pecas (e recalcula partsCost como a soma) quando
  // ha algo real para enviar -- viagem sem NENHUMA peca itemizada (nem antes,
  // nem adicionada agora) nunca manda `parts`, preservando o comportamento
  // 100% inalterado do campo livre "Custo de pecas" para quem nao usa
  // itemizacao (nenhuma regressao para OSs que nunca usaram este recurso).
  const shouldSendParts = parts.length > 0 || hadPartsInitially;

  function updateRow(key: string, patch: Partial<PartRow>) {
    setParts((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setParts((prev) => prev.filter((row) => row.key !== key));
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const partsPayload: MaintenancePartInput[] | undefined = shouldSendParts
        ? parts.map((p) => ({
            ...(p.partId ? { partId: p.partId } : {}),
            name: p.name,
            quantity: Number(p.quantity),
            unitPrice: Number(p.unitPrice),
          }))
        : undefined;
      return updateMaintenance(maintenance.id, {
        ...values,
        component: values.component ? (values.component as MaintenanceComponent) : undefined,
        scheduledAt: values.scheduledAt ? values.scheduledAt : undefined,
        workshopId: values.workshopId || undefined,
        supplierId: values.supplierId || undefined,
        parts: partsPayload,
      });
    },
    onSuccess: () => {
      toast.success('Manutenção atualizada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      onClose();
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar a manutenção.', toFriendlyMessage(error)),
  });

  function handleSave(values: FormValues) {
    if (shouldSendParts && parts.some((p) => !p.name.trim() || !(Number(p.quantity) > 0))) {
      setPartsError('Cada peça precisa de um nome e uma quantidade maior que zero.');
      return;
    }
    setPartsError(null);
    mutation.mutate(values);
  }

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
          <Button onClick={handleSubmit(handleSave)} loading={isSubmitting}>
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
        <FormField
          label="Custo de peças (R$)"
          htmlFor="partsCost"
          hint={shouldSendParts ? 'Calculado automaticamente pela lista de peças abaixo.' : 'Opcional'}
        >
          <Input id="partsCost" type="number" step="0.01" disabled={shouldSendParts} {...register('partsCost')} />
        </FormField>
        <FormField label="Descrição" htmlFor="description" className="sm:col-span-2" hint="Opcional">
          <Input id="description" {...register('description')} />
        </FormField>

        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Peças utilizadas</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setParts((prev) => [...prev, emptyPartRow()])}
            >
              <Plus size={14} />
              Adicionar peça
            </Button>
          </div>
          {parts.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              Nenhuma peça itemizada -- use o campo "Custo de peças" acima ou adicione peças abaixo
              (vinculando ao catálogo, o consumo de estoque é registrado automaticamente ao concluir a OS).
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {parts.map((row) => {
                const selectedPart = partsQuery.data?.items.find((p) => p.id === row.partId);
                return (
                  <div key={row.key} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-12 sm:items-end">
                    <FormField label="Peça do catálogo" htmlFor={`part-catalog-${row.key}`} className="sm:col-span-4" hint="Opcional">
                      <EntitySelect
                        id={`part-catalog-${row.key}`}
                        queryKey={['parts', 'select']}
                        queryFn={() => listParts({ pageSize: 100, isActive: true })}
                        getOptionValue={(p) => p.id}
                        getOptionLabel={(p) => `${p.sku} · ${p.name} (estoque: ${p.currentStock} ${p.unit})`}
                        value={row.partId}
                        onChange={(value) => {
                          const part = partsQuery.data?.items.find((p) => p.id === value);
                          updateRow(row.key, { partId: value, name: part ? part.name : row.name });
                        }}
                        placeholder="Texto livre (sem catálogo)"
                      />
                      {selectedPart && (
                        <p className="mt-1 text-xs text-ink-subtle">Estoque atual: {selectedPart.currentStock} {selectedPart.unit}</p>
                      )}
                    </FormField>
                    <FormField label="Descrição" htmlFor={`part-name-${row.key}`} className="sm:col-span-3">
                      <Input
                        id={`part-name-${row.key}`}
                        value={row.name}
                        onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Quantidade" htmlFor={`part-qty-${row.key}`} className="sm:col-span-2">
                      <Input
                        id={`part-qty-${row.key}`}
                        type="number"
                        step="0.01"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Preço unit. (R$)" htmlFor={`part-price-${row.key}`} className="sm:col-span-2">
                      <Input
                        id={`part-price-${row.key}`}
                        type="number"
                        step="0.01"
                        value={row.unitPrice}
                        onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                      />
                    </FormField>
                    <div className="flex justify-end sm:col-span-1">
                      <Button type="button" variant="ghost" size="sm" title="Remover" onClick={() => removeRow(row.key)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <p className="text-right text-sm text-ink-subtle">
                Total: <strong className="text-ink">{formatCurrency(partsTotal)}</strong>
              </p>
            </div>
          )}
          {partsError && <p className="mt-1 text-xs text-danger-600">{partsError}</p>}
        </div>
      </form>
    </Modal>
  );
}
