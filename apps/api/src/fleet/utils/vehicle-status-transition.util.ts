import { VehicleStatus } from '@prisma/client';

// Funcao pura (Fase 62, mesmo espirito de driver-status-transition.util.ts
// da Fase 61) -- nomeia a acao de auditoria correta para cada transicao de
// status. So ACTIVE/INACTIVE/SUSPENDED (secao 2 da Fase 62) ganham acoes
// distintas; transicoes envolvendo MAINTENANCE/SOLD (fora do escopo desta
// fase, ja existiam desde a Fase 12/45) preservam o nome generico
// 'vehicle.status_changed' -- nao altera o comportamento ja coberto por
// fleet.e2e-spec.ts.
export function resolveVehicleStatusChangeAction(previous: VehicleStatus, next: VehicleStatus): string {
  if (previous === next) return 'vehicle.updated';

  if (next === VehicleStatus.ACTIVE) {
    if (previous === VehicleStatus.SUSPENDED) return 'vehicle.activated';
    if (previous === VehicleStatus.INACTIVE) return 'vehicle.reactivated';
    return 'vehicle.status_changed';
  }
  if (next === VehicleStatus.SUSPENDED) return 'vehicle.suspended';
  if (next === VehicleStatus.INACTIVE) return 'vehicle.deactivated';

  return 'vehicle.status_changed';
}

// So ACTIVE pode ser atribuido/permanecer em uma viagem -- SUSPENDED,
// INACTIVE, MAINTENANCE e SOLD bloqueiam igualmente. Ja e o comportamento
// real de TripsService.startTrip (vehicle.status !== ACTIVE), reproduzido
// aqui apenas como funcao pura testavel, nunca uma segunda checagem.
export function isVehicleAssignableToTrip(status: VehicleStatus): boolean {
  return status === VehicleStatus.ACTIVE;
}
