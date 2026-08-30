'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { DataTable } from '../../components/ui/data-table';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listVehicles } from '../../lib/api/fleet.api';
import {
  createMaintenancePlan,
  deleteMaintenancePlan,
  listMaintenancePlans,
  updateMaintenancePlan,
} from '../../lib/api/maintenance-plans.api';
import { MAINTENANCE_COMPONENT_LABELS } from '../../lib/labels';
import type { MaintenancePlanEntity } from '../../types/entities';
import type { MaintenanceComponent } from '../../types/enums';
import { formatDate, formatNumber } from '../../utils/format';

const COMPONENT_OPTIONS = Object.entries(MAINTENANCE_COMPONENT_LABELS) as [MaintenanceComponent, string][];

// Fase 108 -- avaliacao ao vivo (MaintenancePlanEntity.status), MESMA
// classificacao ja usada pelo dashboard de frota (OVERDUE/DUE_SOON/OK/
// UNKNOWN) -- so um label/tone local, escopo unico desta secao.
const PLAN_STATUS_LABELS: Record<MaintenancePlanEntity['status'], string> = {
  OVERDUE: 'Vencida',
  DUE_SOON: 'Próxima',
  OK: 'Em dia',
  UNKNOWN: 'Sem histórico',
};
const PLAN_STATUS_TONE: Record<MaintenancePlanEntity['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  OVERDUE: 'danger',
  DUE_SOON: 'warning',
  OK: 'success',
  UNKNOWN: 'neutral',
};

function planDueLabel(plan: MaintenancePlanEntity): string {
  if (plan.status === 'OVERDUE') {
    if (plan.overdueByDays !== null) return `há ${plan.overdueByDays} dia(s)`;
    if (plan.overdueByKm !== null) return `há ${formatNumber(plan.overdueByKm, 0)} km`;
    return '—';
  }
  if (plan.status === 'DUE_SOON' || plan.status === 'OK') {
    if (plan.dueDate) return `em ${formatDate(plan.dueDate)}`;
    if (plan.dueOdometerKm !== null) return `aos ${formatNumber(plan.dueOdometerKm, 0)} km`;
  }
  return '—';
}

interface PlanFormState {
  vehicleId: string;
  name: string;
  component: MaintenanceComponent | '';
  intervalKm: string;
  intervalDays: string;
  alertBeforeKm: string;
  alertBeforeDays: string;
}

const EMPTY_FORM: PlanFormState = {
  vehicleId: '',
  name: '',
  component: '',
  intervalKm: '',
  intervalDays: '',
  alertBeforeKm: '',
  alertBeforeDays: '',
};

// Fase 45, secao 11 do pedido -- "gestao dos planos preventivos" dentro da
// propria pagina de Gestao Operacional de manutencao (nunca uma pagina
// separada). Formulario pequeno de proposito: so os campos que definem a
// recorrencia, sem sobrecarregar a tela.
export function MaintenancePlansSection({ vehicleId }: { vehicleId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);

  const query = useQuery({
    queryKey: ['maintenance-plans', vehicleId],
    queryFn: ({ signal }) => listMaintenancePlans({ vehicleId: vehicleId || undefined, pageSize: 50 }, signal),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createMaintenancePlan({
        vehicleId: form.vehicleId,
        name: form.name,
        component: form.component as MaintenanceComponent,
        intervalKm: form.intervalKm ? Number(form.intervalKm) : undefined,
        intervalDays: form.intervalDays ? Number(form.intervalDays) : undefined,
        alertBeforeKm: form.alertBeforeKm ? Number(form.alertBeforeKm) : undefined,
        alertBeforeDays: form.alertBeforeDays ? Number(form.alertBeforeDays) : undefined,
      }),
    onSuccess: () => {
      toast.success('Plano de manutenção criado.');
      queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] });
      setForm(EMPTY_FORM);
      setCreateOpen(false);
    },
    onError: (error) => toast.error('Não foi possível criar o plano.', toFriendlyMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: (plan: MaintenancePlanEntity) => updateMaintenancePlan(plan.id, { active: !plan.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] }),
    onError: (error) => toast.error('Não foi possível atualizar o plano.', toFriendlyMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMaintenancePlan(id),
    onSuccess: () => {
      toast.success('Plano excluído.');
      queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] });
    },
    onError: (error) => toast.error('Não foi possível excluir o plano.', toFriendlyMessage(error)),
  });

  return (
    <Card>
      <CardHeader
        title="Planos de manutenção preventiva"
        description="Recorrência por veículo/componente, usada para calcular vencidas e próximas."
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Novo plano
          </Button>
        }
      />
      <DataTable
        columns={[
          { header: 'Nome', accessorFn: (row) => row.name },
          { header: 'Componente', accessorFn: (row) => MAINTENANCE_COMPONENT_LABELS[row.component] },
          {
            header: 'Intervalo',
            accessorFn: (row) =>
              [row.intervalKm ? `${row.intervalKm} km` : null, row.intervalDays ? `${row.intervalDays} dias` : null]
                .filter(Boolean)
                .join(' / ') || '—',
          },
          {
            header: 'Status',
            cell: ({ row }) => <Badge tone={row.original.active ? 'success' : 'neutral'}>{row.original.active ? 'Ativo' : 'Inativo'}</Badge>,
          },
          {
            header: 'Vencimento',
            cell: ({ row }) => (
              <div className="flex flex-col gap-0.5">
                <Badge tone={PLAN_STATUS_TONE[row.original.status]}>{PLAN_STATUS_LABELS[row.original.status]}</Badge>
                {row.original.status !== 'UNKNOWN' && (
                  <span className="text-xs text-ink-subtle">{planDueLabel(row.original)}</span>
                )}
              </div>
            ),
          },
          {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate(row.original)}>
                  {row.original.active ? 'Desativar' : 'Ativar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(row.original.id)}>
                  Excluir
                </Button>
              </div>
            ),
          },
        ]}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(p) => p.id}
        emptyTitle="Nenhum plano de manutenção cadastrado."
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo plano de manutenção"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancelar
            </Button>
            <Button
              loading={createMutation.isPending}
              disabled={!form.vehicleId || !form.name || !form.component || (!form.intervalKm && !form.intervalDays)}
              onClick={() => createMutation.mutate()}
            >
              Criar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Veículo" htmlFor="plan-vehicle" required className="sm:col-span-2">
            <EntitySelect
              id="plan-vehicle"
              queryKey={['vehicles', 'select']}
              queryFn={() => listVehicles({ pageSize: 100 })}
              getOptionValue={(v) => v.id}
              getOptionLabel={(v) => `${v.plate} · ${v.brand} ${v.model}`}
              value={form.vehicleId}
              onChange={(v) => setForm((prev) => ({ ...prev, vehicleId: v }))}
            />
          </FormField>
          <FormField label="Nome" htmlFor="plan-name" required className="sm:col-span-2">
            <Input id="plan-name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </FormField>
          <FormField label="Componente" htmlFor="plan-component" required>
            <Select
              id="plan-component"
              value={form.component}
              onChange={(e) => setForm((prev) => ({ ...prev, component: e.target.value as MaintenanceComponent }))}
            >
              <option value="">Selecione...</option>
              {COMPONENT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <div />
          <FormField label="Intervalo (km)" htmlFor="plan-interval-km" hint="Ao menos km ou dias">
            <Input
              id="plan-interval-km"
              type="number"
              value={form.intervalKm}
              onChange={(e) => setForm((prev) => ({ ...prev, intervalKm: e.target.value }))}
            />
          </FormField>
          <FormField label="Alertar faltando (km)" htmlFor="plan-alert-km" hint="Opcional">
            <Input
              id="plan-alert-km"
              type="number"
              value={form.alertBeforeKm}
              onChange={(e) => setForm((prev) => ({ ...prev, alertBeforeKm: e.target.value }))}
            />
          </FormField>
          <FormField label="Intervalo (dias)" htmlFor="plan-interval-days" hint="Ao menos km ou dias">
            <Input
              id="plan-interval-days"
              type="number"
              value={form.intervalDays}
              onChange={(e) => setForm((prev) => ({ ...prev, intervalDays: e.target.value }))}
            />
          </FormField>
          <FormField label="Alertar faltando (dias)" htmlFor="plan-alert-days" hint="Opcional">
            <Input
              id="plan-alert-days"
              type="number"
              value={form.alertBeforeDays}
              onChange={(e) => setForm((prev) => ({ ...prev, alertBeforeDays: e.target.value }))}
            />
          </FormField>
        </div>
      </Modal>
    </Card>
  );
}
