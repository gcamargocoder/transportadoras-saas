import { VehicleStatus } from '@prisma/client';
import { resolveFleetAvailabilityStatus, resolveVehicleAvailability } from './vehicle-availability.service';

describe('resolveVehicleAvailability', () => {
  it('retorna UNAVAILABLE para qualquer status diferente de ACTIVE, independente de onTrip', () => {
    expect(resolveVehicleAvailability(VehicleStatus.INACTIVE, false)).toBe('UNAVAILABLE');
    expect(resolveVehicleAvailability(VehicleStatus.SUSPENDED, false)).toBe('UNAVAILABLE');
    expect(resolveVehicleAvailability(VehicleStatus.MAINTENANCE, false)).toBe('UNAVAILABLE');
    expect(resolveVehicleAvailability(VehicleStatus.SOLD, false)).toBe('UNAVAILABLE');
    expect(resolveVehicleAvailability(VehicleStatus.INACTIVE, true)).toBe('UNAVAILABLE');
  });

  it('retorna ON_TRIP quando ACTIVE e em viagem agora', () => {
    expect(resolveVehicleAvailability(VehicleStatus.ACTIVE, true)).toBe('ON_TRIP');
  });

  it('retorna AVAILABLE quando ACTIVE e sem viagem em andamento', () => {
    expect(resolveVehicleAvailability(VehicleStatus.ACTIVE, false)).toBe('AVAILABLE');
  });
});

describe('resolveFleetAvailabilityStatus (Fase 86)', () => {
  it('ACTIVE sem viagem -> AVAILABLE, sem motivo', () => {
    expect(resolveFleetAvailabilityStatus(VehicleStatus.ACTIVE, false)).toEqual({
      status: 'AVAILABLE',
      reason: null,
    });
  });

  it('ACTIVE em viagem -> ON_TRIP, sem motivo', () => {
    expect(resolveFleetAvailabilityStatus(VehicleStatus.ACTIVE, true)).toEqual({
      status: 'ON_TRIP',
      reason: null,
    });
  });

  it('MAINTENANCE -> MAINTENANCE, com motivo (nunca cai em UNAVAILABLE generico)', () => {
    const result = resolveFleetAvailabilityStatus(VehicleStatus.MAINTENANCE, false);
    expect(result.status).toBe('MAINTENANCE');
    expect(result.reason).toEqual(expect.any(String));
  });

  it('INACTIVE -> INACTIVE, com motivo (nunca tratado como disponivel)', () => {
    const result = resolveFleetAvailabilityStatus(VehicleStatus.INACTIVE, false);
    expect(result.status).toBe('INACTIVE');
    expect(result.reason).toEqual(expect.any(String));
  });

  it('SUSPENDED -> UNAVAILABLE, com motivo', () => {
    const result = resolveFleetAvailabilityStatus(VehicleStatus.SUSPENDED, false);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.reason).toEqual(expect.any(String));
  });

  it('SOLD -> UNAVAILABLE, com motivo', () => {
    const result = resolveFleetAvailabilityStatus(VehicleStatus.SOLD, false);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.reason).toEqual(expect.any(String));
  });

  it('prioridade: status != ACTIVE sempre vence onTrip, mesmo em inconsistencia de dados (MAINTENANCE + onTrip=true continua MAINTENANCE, nunca ON_TRIP)', () => {
    expect(resolveFleetAvailabilityStatus(VehicleStatus.MAINTENANCE, true).status).toBe('MAINTENANCE');
    expect(resolveFleetAvailabilityStatus(VehicleStatus.INACTIVE, true).status).toBe('INACTIVE');
    expect(resolveFleetAvailabilityStatus(VehicleStatus.SUSPENDED, true).status).toBe('UNAVAILABLE');
    expect(resolveFleetAvailabilityStatus(VehicleStatus.SOLD, true).status).toBe('UNAVAILABLE');
  });
});
