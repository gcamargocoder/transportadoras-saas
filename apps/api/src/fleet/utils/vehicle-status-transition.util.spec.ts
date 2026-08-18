import { VehicleStatus } from '@prisma/client';
import { isVehicleAssignableToTrip, resolveVehicleStatusChangeAction } from './vehicle-status-transition.util';

describe('resolveVehicleStatusChangeAction', () => {
  it('retorna vehicle.updated quando o status nao muda', () => {
    expect(resolveVehicleStatusChangeAction(VehicleStatus.ACTIVE, VehicleStatus.ACTIVE)).toBe('vehicle.updated');
  });

  it('retorna vehicle.activated ao sair de SUSPENDED para ACTIVE', () => {
    expect(resolveVehicleStatusChangeAction(VehicleStatus.SUSPENDED, VehicleStatus.ACTIVE)).toBe(
      'vehicle.activated',
    );
  });

  it('retorna vehicle.reactivated ao sair de INACTIVE para ACTIVE', () => {
    expect(resolveVehicleStatusChangeAction(VehicleStatus.INACTIVE, VehicleStatus.ACTIVE)).toBe(
      'vehicle.reactivated',
    );
  });

  it('retorna vehicle.suspended ao entrar em SUSPENDED', () => {
    expect(resolveVehicleStatusChangeAction(VehicleStatus.ACTIVE, VehicleStatus.SUSPENDED)).toBe(
      'vehicle.suspended',
    );
  });

  it('retorna vehicle.deactivated ao entrar em INACTIVE', () => {
    expect(resolveVehicleStatusChangeAction(VehicleStatus.ACTIVE, VehicleStatus.INACTIVE)).toBe(
      'vehicle.deactivated',
    );
  });

  it('retorna vehicle.status_changed para transicoes envolvendo MAINTENANCE (comportamento pre-Fase 62 preservado)', () => {
    expect(resolveVehicleStatusChangeAction(VehicleStatus.ACTIVE, VehicleStatus.MAINTENANCE)).toBe(
      'vehicle.status_changed',
    );
    expect(resolveVehicleStatusChangeAction(VehicleStatus.MAINTENANCE, VehicleStatus.ACTIVE)).toBe(
      'vehicle.status_changed',
    );
  });

  it('retorna vehicle.status_changed para transicoes envolvendo SOLD', () => {
    expect(resolveVehicleStatusChangeAction(VehicleStatus.ACTIVE, VehicleStatus.SOLD)).toBe(
      'vehicle.status_changed',
    );
  });
});

describe('isVehicleAssignableToTrip', () => {
  it('permite apenas ACTIVE', () => {
    expect(isVehicleAssignableToTrip(VehicleStatus.ACTIVE)).toBe(true);
    expect(isVehicleAssignableToTrip(VehicleStatus.SUSPENDED)).toBe(false);
    expect(isVehicleAssignableToTrip(VehicleStatus.INACTIVE)).toBe(false);
    expect(isVehicleAssignableToTrip(VehicleStatus.MAINTENANCE)).toBe(false);
    expect(isVehicleAssignableToTrip(VehicleStatus.SOLD)).toBe(false);
  });
});
