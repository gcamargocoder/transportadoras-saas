import { DriverStatus } from '@prisma/client';

// Funcoes puras (Fase 61) -- nunca leem/escrevem banco. Nomeiam a acao de
// auditoria correta para cada transicao de status e decidem se um
// motorista pode ser atribuido a uma NOVA viagem, sem duplicar a checagem
// ja existente em TripsService.assertDriverAvailable (que le
// Driver.isActive, mantido sincronizado por DriversService.updateStatus).
export function resolveDriverStatusChangeAction(previous: DriverStatus, next: DriverStatus): string {
  if (previous === next) return 'driver.updated';
  if (next === DriverStatus.ACTIVE) return 'driver.reactivated';
  if (next === DriverStatus.SUSPENDED) return 'driver.suspended';
  return 'driver.deactivated';
}

// Somente ACTIVE pode ser atribuido a uma nova viagem -- SUSPENDED e
// INACTIVE bloqueiam igualmente (secao 3 da Fase 61).
export function isDriverAssignableToTrip(status: DriverStatus): boolean {
  return status === DriverStatus.ACTIVE;
}
