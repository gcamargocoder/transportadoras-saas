import { Trailer, TireMovement, UserAccount, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TireMovementEntity } from '../entities/tire-movement.entity';

export type TireMovementWithRelations = TireMovement & {
  previousVehicle: Vehicle | null;
  newVehicle: Vehicle | null;
  previousTrailer: Trailer | null;
  newTrailer: Trailer | null;
  creator: UserAccount;
  // Fase 109 -- so para o rotulo (numero da OS); null quando maintenanceId
  // e nulo.
  maintenance: { serviceOrderNumber: string | null } | null;
};

export function toTireMovementEntity(movement: TireMovementWithRelations): TireMovementEntity {
  const entity = new TireMovementEntity();
  entity.id = movement.id;
  entity.tireId = movement.tireId;
  entity.movementDate = movement.movementDate;
  entity.previousLocationType = movement.previousLocationType;
  entity.previousVehicleId = movement.previousVehicleId;
  entity.previousVehiclePlate = movement.previousVehicle?.plate ?? null;
  entity.previousTrailerId = movement.previousTrailerId;
  entity.previousTrailerPlate = movement.previousTrailer?.plate ?? null;
  entity.previousPosition = movement.previousPosition;
  entity.newLocationType = movement.newLocationType;
  entity.newVehicleId = movement.newVehicleId;
  entity.newVehiclePlate = movement.newVehicle?.plate ?? null;
  entity.newTrailerId = movement.newTrailerId;
  entity.newTrailerPlate = movement.newTrailer?.plate ?? null;
  entity.newPosition = movement.newPosition;
  entity.odometerKm = toNumberOrNull(movement.odometerKm);
  entity.reason = movement.reason;
  entity.maintenanceId = movement.maintenanceId;
  entity.maintenanceServiceOrderNumber = movement.maintenance?.serviceOrderNumber ?? null;
  entity.createdBy = movement.createdBy;
  entity.creatorName = movement.creator.name;
  entity.createdAt = movement.createdAt;
  return entity;
}
