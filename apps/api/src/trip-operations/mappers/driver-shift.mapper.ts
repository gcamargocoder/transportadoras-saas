import { DriverShift, ShiftBreak } from '@prisma/client';
import { DriverShiftEntity, DriverShiftStatus, ShiftBreakEntity } from '../entities/driver-shift.entity';

export function computeDriverShiftStatus(shift: { endedAt: Date | null; cancelledAt: Date | null }): DriverShiftStatus {
  if (shift.cancelledAt) return 'CANCELLED';
  if (shift.endedAt) return 'CLOSED';
  return 'OPEN';
}

function computeMinutes(startedAt: Date, endedAt: Date | null): number | null {
  if (!endedAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));
}

export function toShiftBreakEntity(shiftBreak: ShiftBreak): ShiftBreakEntity {
  const entity = new ShiftBreakEntity();
  entity.id = shiftBreak.id;
  entity.driverShiftId = shiftBreak.driverShiftId;
  entity.type = shiftBreak.type;
  entity.startedAt = shiftBreak.startedAt;
  entity.endedAt = shiftBreak.endedAt;
  entity.durationMinutes = computeMinutes(shiftBreak.startedAt, shiftBreak.endedAt);
  entity.reason = shiftBreak.reason;
  return entity;
}

export function toDriverShiftEntity(shift: DriverShift & { breaks: ShiftBreak[] }): DriverShiftEntity {
  const entity = new DriverShiftEntity();
  entity.id = shift.id;
  entity.driverId = shift.driverId;
  entity.tripId = shift.tripId;
  entity.status = computeDriverShiftStatus(shift);
  entity.startedAt = shift.startedAt;
  entity.endedAt = shift.endedAt;
  entity.cancelledAt = shift.cancelledAt;
  entity.durationMinutes = computeMinutes(shift.startedAt, shift.endedAt);
  entity.breaks = shift.breaks.map(toShiftBreakEntity);

  const closedBreakMinutes = entity.breaks.reduce((sum, b) => sum + (b.durationMinutes ?? 0), 0);
  entity.workedMinutes = entity.durationMinutes === null ? null : Math.max(0, entity.durationMinutes - closedBreakMinutes);

  entity.createdAt = shift.createdAt;
  entity.updatedAt = shift.updatedAt;
  return entity;
}
