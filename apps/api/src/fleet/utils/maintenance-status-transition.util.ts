import { ConflictException } from '@nestjs/common';
import { VehicleMaintenanceStatus } from '@prisma/client';

// Fase 63 -- funcao pura (mesmo espirito de vehicle-status-transition.util.ts
// da Fase 62): COMPLETED e CANCELLED sao estados terminais -- nenhuma
// transicao originada deles e aceita (nunca "reabrir" uma manutencao ja
// concluida/cancelada; se foi um erro, corrija via novo registro). A partir
// de qualquer estado nao-terminal (OPEN/WAITING_PARTS/IN_PROGRESS) qualquer
// outro status e aceito, incluindo ir direto para COMPLETED sem passar por
// IN_PROGRESS (fluxo real: servico rapido resolvido na hora) -- ja coberto
// por maintenances.e2e-spec.ts ("bloqueia exclusao de manutencao concluida").
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
  if (next === VehicleMaintenanceStatus.IN_PROGRESS) return 'maintenance.started';
  if (next === VehicleMaintenanceStatus.COMPLETED) return 'maintenance.completed';
  if (next === VehicleMaintenanceStatus.CANCELLED) return 'maintenance.cancelled';
  return 'maintenance.status_changed';
}

// So OPEN/WAITING_PARTS/IN_PROGRESS contam como "manutencao em aberto"
// (mesma divisao ja usada em FleetOperationsMetricsService/
// VehiclesService.softDelete) -- reproduzida aqui apenas como funcao pura
// testavel, nunca uma segunda fonte de verdade.
export function isMaintenanceOpenStatus(status: VehicleMaintenanceStatus): boolean {
  return (
    status === VehicleMaintenanceStatus.OPEN ||
    status === VehicleMaintenanceStatus.WAITING_PARTS ||
    status === VehicleMaintenanceStatus.IN_PROGRESS
  );
}
