import { ConflictException } from '@nestjs/common';
import { VehicleMaintenanceStatus } from '@prisma/client';

// Fase 63 -- funcao pura (mesmo espirito de vehicle-status-transition.util.ts
// da Fase 62): COMPLETED e CANCELLED sao estados terminais -- nenhuma
// transicao originada deles e aceita (nunca "reabrir" uma manutencao ja
// concluida/cancelada; se foi um erro, corrija via novo registro). A partir
// de qualquer estado nao-terminal (OPEN/WAITING_PARTS/IN_PROGRESS/os 3 novos
// estados da Fase 82) qualquer outro status e aceito por este guard generico,
// incluindo ir direto para COMPLETED sem passar por IN_PROGRESS (fluxo real:
// servico rapido resolvido na hora) -- ja coberto por
// maintenances.e2e-spec.ts ("bloqueia exclusao de manutencao concluida").
// Usado apenas pelo PATCH /maintenances/:id/status generico (compatibilidade
// retroativa, inalterado desde a Fase 63); as acoes dedicadas da Fase 82
// (diagnose/submit-for-approval/approve/start/complete/cancel) usam o guard
// mais estrito assertWorkOrderActionAllowed abaixo.
const TERMINAL_STATUSES: VehicleMaintenanceStatus[] = [
  VehicleMaintenanceStatus.COMPLETED,
  VehicleMaintenanceStatus.CANCELLED,
];

export function assertValidMaintenanceStatusTransition(
  previous: VehicleMaintenanceStatus,
  next: VehicleMaintenanceStatus,
): void {
  if (previous === next) return;
  if (TERMINAL_STATUSES.includes(previous)) {
    const label = previous === VehicleMaintenanceStatus.COMPLETED ? 'concluida' : 'cancelada';
    throw new ConflictException(
      `Nao e possivel alterar o status de uma manutencao ja ${label}.`,
    );
  }
}

// Nomeia a acao de auditoria de acordo com a transicao (mesmo padrao de
// resolveVehicleStatusChangeAction/resolveDriverStatusChangeAction) --
// WAITING_PARTS (sem semantica de inicio/fim propria) preserva o nome
// generico 'maintenance.status_changed'.
export function resolveMaintenanceStatusChangeAction(
  previous: VehicleMaintenanceStatus,
  next: VehicleMaintenanceStatus,
): string {
  if (previous === next) return 'maintenance.updated';
  if (next === VehicleMaintenanceStatus.DIAGNOSING) return 'maintenance.diagnosing';
  if (next === VehicleMaintenanceStatus.AWAITING_APPROVAL) return 'maintenance.awaiting_approval';
  if (next === VehicleMaintenanceStatus.APPROVED) return 'maintenance.approved';
  if (next === VehicleMaintenanceStatus.IN_PROGRESS) return 'maintenance.started';
  if (next === VehicleMaintenanceStatus.COMPLETED) return 'maintenance.completed';
  if (next === VehicleMaintenanceStatus.CANCELLED) return 'maintenance.cancelled';
  return 'maintenance.status_changed';
}

// Fase 82 -- fonte central de "OS em aberto" (nao concluida/cancelada),
// exportada para eliminar a duplicacao local do mesmo conceito que ja existia
// em FleetOperationsMetricsService e DashboardService (ambos com uma copia
// literal desta mesma lista). Inclui os 3 novos estados do ciclo de vida da
// OS: DIAGNOSING/AWAITING_APPROVAL/APPROVED sao tao "em aberto" quanto
// OPEN/WAITING_PARTS/IN_PROGRESS.
export const OPEN_MAINTENANCE_STATUSES: VehicleMaintenanceStatus[] = [
  VehicleMaintenanceStatus.OPEN,
  VehicleMaintenanceStatus.DIAGNOSING,
  VehicleMaintenanceStatus.AWAITING_APPROVAL,
  VehicleMaintenanceStatus.APPROVED,
  VehicleMaintenanceStatus.IN_PROGRESS,
  VehicleMaintenanceStatus.WAITING_PARTS,
];

// Reproduzida aqui apenas como funcao pura testavel sobre OPEN_MAINTENANCE_STATUSES,
// nunca uma segunda fonte de verdade.
export function isMaintenanceOpenStatus(status: VehicleMaintenanceStatus): boolean {
  return OPEN_MAINTENANCE_STATUSES.includes(status);
}

// Fase 82 -- acoes dedicadas do ciclo de vida da Ordem de Servico (secao 4 do
// pedido). Guard MAIS ESTRITO que assertValidMaintenanceStatusTransition
// (que continua permissivo, so para o PATCH generico): cada acao so e aceita
// a partir de um conjunto especifico de status de origem. "start" e
// "complete" propositalmente aceitam multiplas origens (OPEN incluso) para
// preservar o fluxo real ja existente de servico rapido resolvido na hora
// sem passar por diagnostico/aprovacao formal (mesma excecao documentada
// acima para assertValidMaintenanceStatusTransition).
export type WorkOrderAction =
  | 'diagnose'
  | 'submitForApproval'
  | 'approve'
  | 'start'
  | 'complete'
  | 'cancel';

const WORK_ORDER_ACTION_ALLOWED_FROM: Record<WorkOrderAction, VehicleMaintenanceStatus[]> = {
  diagnose: [VehicleMaintenanceStatus.OPEN],
  submitForApproval: [VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.DIAGNOSING],
  approve: [VehicleMaintenanceStatus.AWAITING_APPROVAL],
  start: [
    VehicleMaintenanceStatus.OPEN,
    VehicleMaintenanceStatus.DIAGNOSING,
    VehicleMaintenanceStatus.APPROVED,
    VehicleMaintenanceStatus.WAITING_PARTS,
  ],
  complete: OPEN_MAINTENANCE_STATUSES,
  cancel: OPEN_MAINTENANCE_STATUSES,
};

const WORK_ORDER_ACTION_LABEL: Record<WorkOrderAction, string> = {
  diagnose: 'iniciar o diagnostico',
  submitForApproval: 'enviar para aprovacao',
  approve: 'aprovar',
  start: 'iniciar a execucao',
  complete: 'concluir',
  cancel: 'cancelar',
};

export function assertWorkOrderActionAllowed(
  action: WorkOrderAction,
  current: VehicleMaintenanceStatus,
): void {
  const allowedFrom = WORK_ORDER_ACTION_ALLOWED_FROM[action];
  if (!allowedFrom.includes(current)) {
    throw new ConflictException(
      `Nao e possivel ${WORK_ORDER_ACTION_LABEL[action]} a partir do status atual (${current}).`,
    );
  }
}
