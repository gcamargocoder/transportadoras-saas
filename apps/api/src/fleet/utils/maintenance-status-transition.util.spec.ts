import { ConflictException } from '@nestjs/common';
import { VehicleMaintenanceStatus } from '@prisma/client';
import {
  assertValidMaintenanceStatusTransition,
  isMaintenanceOpenStatus,
  resolveMaintenanceStatusChangeAction,
} from './maintenance-status-transition.util';

describe('assertValidMaintenanceStatusTransition', () => {
  it('permite qualquer transicao a partir de OPEN, incluindo direto para COMPLETED', () => {
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.COMPLETED),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.CANCELLED),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.WAITING_PARTS),
    ).not.toThrow();
  });

  it('permite qualquer transicao a partir de WAITING_PARTS/IN_PROGRESS', () => {
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.WAITING_PARTS, VehicleMaintenanceStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.IN_PROGRESS, VehicleMaintenanceStatus.COMPLETED),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.IN_PROGRESS, VehicleMaintenanceStatus.CANCELLED),
    ).not.toThrow();
  });

  it('permite transicao identica (no-op)', () => {
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.COMPLETED, VehicleMaintenanceStatus.COMPLETED),
    ).not.toThrow();
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.CANCELLED, VehicleMaintenanceStatus.CANCELLED),
    ).not.toThrow();
  });

  it('rejeita qualquer transicao a partir de COMPLETED (estado terminal)', () => {
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.COMPLETED, VehicleMaintenanceStatus.OPEN),
    ).toThrow(ConflictException);
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.COMPLETED, VehicleMaintenanceStatus.IN_PROGRESS),
    ).toThrow(ConflictException);
  });

  it('rejeita qualquer transicao a partir de CANCELLED (estado terminal)', () => {
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.CANCELLED, VehicleMaintenanceStatus.OPEN),
    ).toThrow(ConflictException);
    expect(() =>
      assertValidMaintenanceStatusTransition(VehicleMaintenanceStatus.CANCELLED, VehicleMaintenanceStatus.IN_PROGRESS),
    ).toThrow(ConflictException);
  });
});

describe('resolveMaintenanceStatusChangeAction', () => {
  it('nomeia acoes especificas para IN_PROGRESS/COMPLETED/CANCELLED', () => {
    expect(resolveMaintenanceStatusChangeAction(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.IN_PROGRESS)).toBe(
      'maintenance.started',
    );
    expect(resolveMaintenanceStatusChangeAction(VehicleMaintenanceStatus.IN_PROGRESS, VehicleMaintenanceStatus.COMPLETED)).toBe(
      'maintenance.completed',
    );
    expect(resolveMaintenanceStatusChangeAction(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.CANCELLED)).toBe(
      'maintenance.cancelled',
    );
  });

  it('usa nome generico para WAITING_PARTS e transicao identica', () => {
    expect(resolveMaintenanceStatusChangeAction(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.WAITING_PARTS)).toBe(
      'maintenance.status_changed',
    );
    expect(resolveMaintenanceStatusChangeAction(VehicleMaintenanceStatus.OPEN, VehicleMaintenanceStatus.OPEN)).toBe(
      'maintenance.updated',
    );
  });
});

describe('isMaintenanceOpenStatus', () => {
  it('OPEN/WAITING_PARTS/IN_PROGRESS sao abertas; COMPLETED/CANCELLED nao', () => {
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.OPEN)).toBe(true);
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.WAITING_PARTS)).toBe(true);
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.IN_PROGRESS)).toBe(true);
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.COMPLETED)).toBe(false);
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.CANCELLED)).toBe(false);
  });
});
