import { Prisma } from '@prisma/client';
import { VehicleIdlePeriodEntity } from '../entities/vehicle-idle-period.entity';

// Include usado por todas as leituras deste modulo -- placa do veiculo e
// destino da viagem anterior em 1 unica consulta (nunca N+1).
export const IDLE_PERIOD_INCLUDE = {
  vehicle: { select: { plate: true } },
  tripBefore: { select: { destination: { select: { name: true } } } },
} satisfies Prisma.VehicleIdlePeriodInclude;

type VehicleIdlePeriodWithIncludes = Prisma.VehicleIdlePeriodGetPayload<{ include: typeof IDLE_PERIOD_INCLUDE }>;

export function toVehicleIdlePeriodEntity(row: VehicleIdlePeriodWithIncludes): VehicleIdlePeriodEntity {
  const entity = new VehicleIdlePeriodEntity();
  entity.id = row.id;
  entity.vehicleId = row.vehicleId;
  entity.plate = row.vehicle?.plate ?? null;
  entity.startedAt = row.startedAt;
  entity.endedAt = row.endedAt;
  entity.durationMinutes = row.durationMinutes;
  entity.reason = row.reason;
  entity.source = row.source;
  entity.tripBeforeId = row.tripBeforeId;
  entity.tripAfterId = row.tripAfterId;
  entity.previousDestinationLabel = row.tripBefore?.destination?.name ?? null;
  entity.notes = row.notes;
  entity.status = row.endedAt === null ? 'OPEN' : 'CLOSED';
  entity.createdAt = row.createdAt;
  entity.updatedAt = row.updatedAt;
  return entity;
}
