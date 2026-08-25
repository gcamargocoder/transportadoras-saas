import { ConflictException } from '@nestjs/common';
import { VehicleMaintenanceStatus } from '@prisma/client';
import {
  assertValidMaintenanceStatusTransition,
  assertWorkOrderActionAllowed,
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

  it('Fase 82 -- DIAGNOSING/AWAITING_APPROVAL/APPROVED tambem sao abertas', () => {
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.DIAGNOSING)).toBe(true);
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.AWAITING_APPROVAL)).toBe(true);
    expect(isMaintenanceOpenStatus(VehicleMaintenanceStatus.APPROVED)).toBe(true);
  });
});

describe('assertWorkOrderActionAllowed (Fase 82 -- ciclo de vida da OS)', () => {
  it('diagnose: so a partir de OPEN', () => {
    expect(() => assertWorkOrderActionAllowed('diagnose', VehicleMaintenanceStatus.OPEN)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('diagnose', VehicleMaintenanceStatus.DIAGNOSING)).toThrow(ConflictException);
    expect(() => assertWorkOrderActionAllowed('diagnose', VehicleMaintenanceStatus.IN_PROGRESS)).toThrow(ConflictException);
  });

  it('submitForApproval: a partir de OPEN ou DIAGNOSING', () => {
    expect(() => assertWorkOrderActionAllowed('submitForApproval', VehicleMaintenanceStatus.OPEN)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('submitForApproval', VehicleMaintenanceStatus.DIAGNOSING)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('submitForApproval', VehicleMaintenanceStatus.APPROVED)).toThrow(ConflictException);
  });

  it('approve: somente a partir de AWAITING_APPROVAL', () => {
    expect(() => assertWorkOrderActionAllowed('approve', VehicleMaintenanceStatus.AWAITING_APPROVAL)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('approve', VehicleMaintenanceStatus.OPEN)).toThrow(ConflictException);
    expect(() => assertWorkOrderActionAllowed('approve', VehicleMaintenanceStatus.DIAGNOSING)).toThrow(ConflictException);
  });

  it('start: a partir de OPEN/DIAGNOSING/APPROVED/WAITING_PARTS, nunca de AWAITING_APPROVAL', () => {
    expect(() => assertWorkOrderActionAllowed('start', VehicleMaintenanceStatus.OPEN)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('start', VehicleMaintenanceStatus.DIAGNOSING)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('start', VehicleMaintenanceStatus.APPROVED)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('start', VehicleMaintenanceStatus.WAITING_PARTS)).not.toThrow();
    expect(() => assertWorkOrderActionAllowed('start', VehicleMaintenanceStatus.AWAITING_APPROVAL)).toThrow(ConflictException);
  });

  it('complete/cancel: a partir de qualquer estado nao-terminal, incluindo os novos', () => {
    for (const status of [
      VehicleMaintenanceStatus.OPEN,
      VehicleMaintenanceStatus.DIAGNOSING,
      VehicleMaintenanceStatus.AWAITING_APPROVAL,
      VehicleMaintenanceStatus.APPROVED,
      VehicleMaintenanceStatus.IN_PROGRESS,
      VehicleMaintenanceStatus.WAITING_PARTS,
    ]) {
      expect(() => assertWorkOrderActionAllowed('complete', status)).not.toThrow();
      expect(() => assertWorkOrderActionAllowed('cancel', status)).not.toThrow();
    }
  });
});
