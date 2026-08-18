import { DriverStatus } from '@prisma/client';
import { isDriverAssignableToTrip, resolveDriverStatusChangeAction } from './driver-status-transition.util';

describe('resolveDriverStatusChangeAction', () => {
  it('retorna driver.updated quando o status nao muda', () => {
    expect(resolveDriverStatusChangeAction(DriverStatus.ACTIVE, DriverStatus.ACTIVE)).toBe('driver.updated');
    expect(resolveDriverStatusChangeAction(DriverStatus.SUSPENDED, DriverStatus.SUSPENDED)).toBe('driver.updated');
  });

  it('retorna driver.reactivated ao transicionar para ACTIVE vindo de qualquer outro status', () => {
    expect(resolveDriverStatusChangeAction(DriverStatus.INACTIVE, DriverStatus.ACTIVE)).toBe('driver.reactivated');
    expect(resolveDriverStatusChangeAction(DriverStatus.SUSPENDED, DriverStatus.ACTIVE)).toBe('driver.reactivated');
  });

  it('retorna driver.suspended ao transicionar para SUSPENDED', () => {
    expect(resolveDriverStatusChangeAction(DriverStatus.ACTIVE, DriverStatus.SUSPENDED)).toBe('driver.suspended');
    expect(resolveDriverStatusChangeAction(DriverStatus.INACTIVE, DriverStatus.SUSPENDED)).toBe('driver.suspended');
  });

  it('retorna driver.deactivated ao transicionar para INACTIVE', () => {
    expect(resolveDriverStatusChangeAction(DriverStatus.ACTIVE, DriverStatus.INACTIVE)).toBe('driver.deactivated');
    expect(resolveDriverStatusChangeAction(DriverStatus.SUSPENDED, DriverStatus.INACTIVE)).toBe('driver.deactivated');
  });
});

describe('isDriverAssignableToTrip', () => {
  it('somente ACTIVE pode ser atribuido a uma nova viagem', () => {
    expect(isDriverAssignableToTrip(DriverStatus.ACTIVE)).toBe(true);
  });

  it('SUSPENDED nunca pode ser atribuido a uma nova viagem', () => {
    expect(isDriverAssignableToTrip(DriverStatus.SUSPENDED)).toBe(false);
  });

  it('INACTIVE nunca pode ser atribuido a uma nova viagem', () => {
    expect(isDriverAssignableToTrip(DriverStatus.INACTIVE)).toBe(false);
  });
});
