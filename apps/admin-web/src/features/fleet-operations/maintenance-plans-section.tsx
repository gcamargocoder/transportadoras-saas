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
  listMaintenancePlanExecutions,
  listMaintenancePlans,
  registerMaintenancePlanExecution,
  updateMaintenancePlan,
} from '../../lib/api/maintenance-plans.api';
import { MAINTENANCE_COMPONENT_LABELS } from '../../lib/labels';
import type { MaintenancePlanEntity } from '../../types/entities';
import type { MaintenanceComponent } from '../../types/enums';
import { formatDate, formatDateTime, formatNumber } from '../../utils/format';

const COMPONENT_OPTIONS = Object.entries(MAINTENANCE_COMPONENT_LABELS) as [MaintenanceComponent, string][];

// Fase 81 -- rotulo do status calculado no BACKEND (5 valores). "Vencida"
// (status === 'OVERDUE') e detalhada por overdueReason: KM / data / os dois.
function planStatusLabel(plan: MaintenancePlanEntity): string {
  if (plan.status === 'OVERDUE') {
    if (plan.overdueReason === 'BOTH') return 'Vencida pelos dois critérios';
    if (plan.overdueReason === 'KM') return 'Vencida por KM';
    if (plan.overdueReason === 'DATE') return 'Vencida por data';
    return 'Vencida';
  }
  if (plan.status === 'DUE_SOON') return 'Próxima';
  if (plan.status === 'OK') return 'Em dia';
  return 'Sem histórico';
}
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
  notes: string;
}

const EMPTY_FORM: PlanFormState = {
  vehicleId: '',
  name: '',
  component: '',
  intervalKm: '',
  intervalDays: '',
  alertBeforeKm: '',
  alertBeforeDays: '',
  notes: '',
};

function toForm(plan: MaintenancePlanEntity): PlanFormState {
  return {
    vehicleId: plan.vehicleId,
    name: plan.name,
    component: plan.component,
    intervalKm: plan.intervalKm !== null ? String(plan.intervalKm) : '',
    intervalDays: plan.intervalDays !== null ? String(plan.intervalDays) : '',
    alertBeforeKm: plan.alertBeforeKm !== null ? String(plan.alertBeforeKm) : '',
    alertBeforeDays: plan.alertBeforeDays !== null ? String(plan.alertBeforeDays) : '',
    notes: plan.notes ?? '',
  };
}

// Fase 45/81 -- "gestao dos planos preventivos" dentro da propria pagina de
// Gestao Operacional de manutencao. Formulario pequeno de proposito: so os
// campos que definem a recorrencia + observacoes.
export function MaintenancePlansSection({ vehicleId }: { vehicleId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [execPlan, setExecPlan] = useState<MaintenancePlanEntity | null>(null);
  const [execForm, setExecForm] = useState({ executedAt: '', odometerKm: '', notes: '' });
  const [historyPlan, setHistoryPlan] = useState<MaintenancePlanEntity | null>(null);

  const query = useQuery({
    queryKey: ['maintenance-plans', vehicleId],
    queryFn: ({ signal }) => listMaintenancePlans({ vehicleId: vehicleId || undefined, pageSize: 50 }, signal),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] });
  }

  const savePayload = () => ({
    vehicleId: form.vehicleId,
    name: form.name,
    component: form.component as MaintenanceComponent,
    intervalKm: form.intervalKm ? Number(form.intervalKm) : undefined,
    intervalDays: form.intervalDays ? Number(form.intervalDays) : undefined,
    alertBeforeKm: form.alertBeforeKm ? Number(form.alertBeforeKm) : undefined,
    alertBeforeDays: form.alertBeforeDays ? Number(form.alertBeforeDays) : undefined,
    notes: form.notes ? form.notes : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? updateMaintenancePlan(editingId, savePayload()) : createMaintenancePlan(savePayload())),
    onSuccess: () => {
      toast.success(editingId ? 'Plano atualizado.' : 'Plano de manutenção criado.');
      invalidate();
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFormOpen(false);
    },
    onError: (error) => toast.error('Não foi possível salvar o plano.', toFriendlyMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: (plan: MaintenancePlanEntity) => updateMaintenancePlan(plan.id, { active: !plan.active }),
    onSuccess: invalidate,
    onError: (error) => toast.error('Não foi possível atualizar o plano.', toFriendlyMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMaintenancePlan(id),
    onSuccess: () => {
      toast.success('Plano excluído.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível excluir o plano.', toFriendlyMessage(error)),
  });

  const executionMutation = useMutation({
    mutationFn: () =>
      registerMaintenancePlanExecution(execPlan!.id, {
        executedAt: execForm.executedAt ? new Date(execForm.executedAt).toISOString() : undefined,
        odometerKm: execForm.odometerKm ? Number(execForm.odometerKm) : undefined,
        notes: execForm.notes ? execForm.notes : undefined,
      }),
    onSuccess: () => {
      toast.success('Execução registrada. Próxima manutenção recalculada.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['maintenance-plan-executions'] });
      setExecPlan(null);
      setExecForm({ executedAt: '', odometerKm: '', notes: '' });
    },
    onError: (error) => toast.error('Não foi possível registrar a execução.', toFriendlyMessage(error)),
  });

  const historyQuery = useQuery({
    queryKey: ['maintenance-plan-executions', historyPlan?.id],
    queryFn: ({ signal }) => listMaintenancePlanExecutions(historyPlan!.id, { pageSize: 50 }, signal),
    enabled: historyPlan !== null,
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }
  function openEdit(plan: MaintenancePlanEntity) {
    setEditingId(plan.id);
    setForm(toForm(plan));
    setFormOpen(true);
  }

  return (
    <Card>
      <CardHeader
        title="Planos de manutenção preventiva"
        description="Recorrência por veículo/componente, usada para calcular vencidas e próximas."
        action={
          <Button size="sm" onClick={openCreate}>
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
            header: 'Ativo',
            cell: ({ row }) => <Badge tone={row.original.active ? 'success' : 'neutral'}>{row.original.active ? 'Ativo' : 'Inativo'}</Badge>,
          },
          {
            header: 'Vencimento',
            cell: ({ row }) => (
              <div className="flex flex-col gap-0.5">
                <Badge tone={PLAN_STATUS_TONE[row.original.status]}>{planStatusLabel(row.original)}</Badge>
                {row.original.status !== 'UNKNOWN' && (
                  <span className="text-xs text-ink-subtle">{planDueLabel(row.original)}</span>
                )}
              </div>
            ),
          },
          {
            header: 'Última execução',
            cell: ({ row }) =>
              row.original.lastExecution?.executedAt ? (
                <span className="text-xs text-ink-subtle">
                  {formatDate(row.original.lastExecution.executedAt)}
                  {row.original.lastExecution.odometerKm !== null &&
                    ` · ${formatNumber(row.original.lastExecution.odometerKm, 0)} km`}
                </span>
              ) : (
                <span className="text-xs text-ink-subtle">—</span>
              ),
          },
          {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setExecPlan(row.original)}>
                  Registrar execução
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setHistoryPlan(row.original)}>
                  Histórico
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(row.original)}>
                  Editar
                </Button>
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Editar plano de manutenção' : 'Novo plano de manutenção'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Cancelar
            </Button>
            <Button
              loading={saveMutation.isPending}
              disabled={!form.vehicleId || !form.name || !form.component || (!form.intervalKm && !form.intervalDays)}
              onClick={() => saveMutation.mutate()}
            >
              {editingId ? 'Salvar' : 'Criar'}
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
          <FormField label="Descrição / serviço" htmlFor="plan-name" required className="sm:col-span-2">
            <Input id="plan-name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </FormField>
          <FormField label="Categoria / componente" htmlFor="plan-component" required>
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
          <FormField label="Observações" htmlFor="plan-notes" hint="Opcional" className="sm:col-span-2">
            <Input id="plan-notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={execPlan !== null}
        onClose={() => setExecPlan(null)}
        title="Registrar execução"
        description="Registra que o serviço preventivo foi feito. Não abre OS nem altera o odômetro do veículo."
        footer={
          <>
            <Button variant="outline" onClick={() => setExecPlan(null)} disabled={executionMutation.isPending}>
              Cancelar
            </Button>
            <Button loading={executionMutation.isPending} onClick={() => executionMutation.mutate()}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Data da execução" htmlFor="exec-date" hint="Opcional — padrão: agora">
            <Input
              id="exec-date"
              type="datetime-local"
              value={execForm.executedAt}
              onChange={(e) => setExecForm((prev) => ({ ...prev, executedAt: e.target.value }))}
            />
          </FormField>
          <FormField label="Odômetro (km)" htmlFor="exec-odometer" hint="Opcional">
            <Input
              id="exec-odometer"
              type="number"
              value={execForm.odometerKm}
              onChange={(e) => setExecForm((prev) => ({ ...prev, odometerKm: e.target.value }))}
            />
          </FormField>
          <FormField label="Observações" htmlFor="exec-notes" hint="Opcional" className="sm:col-span-2">
            <Input
              id="exec-notes"
              value={execForm.notes}
              onChange={(e) => setExecForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={historyPlan !== null}
        onClose={() => setHistoryPlan(null)}
        title="Histórico de execuções"
        footer={
          <Button variant="outline" onClick={() => setHistoryPlan(null)}>
            Fechar
          </Button>
        }
      >
        {historyQuery.isLoading ? (
          <p className="text-sm text-ink-subtle">Carregando…</p>
        ) : (historyQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-subtle">Nenhuma execução registrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {historyQuery.data?.items.map((exec) => (
              <li key={exec.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-ink">
                    {exec.executedAt ? formatDateTime(exec.executedAt) : '—'}
                  </p>
                  {exec.notes && <p className="text-xs text-ink-subtle">{exec.notes}</p>}
                </div>
                <span className="text-xs text-ink-subtle">
                  {exec.odometerKm !== null ? `${formatNumber(exec.odometerKm, 0)} km` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </Card>
  );
}
