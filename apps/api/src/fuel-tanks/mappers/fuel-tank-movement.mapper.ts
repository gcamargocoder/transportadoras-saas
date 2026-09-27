import { FuelTankMovement } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FuelTankMovementEntity } from '../entities/fuel-tank-movement.entity';

export function toFuelTankMovementEntity(movement: FuelTankMovement): FuelTankMovementEntity {
  const entity = new FuelTankMovementEntity();
  entity.id = movement.id;
  entity.tankId = movement.tankId;
  entity.type = movement.type;
  entity.quantityLiters = toNumberOrNull(movement.quantityLiters) ?? 0;
  entity.previousBalanceLiters = toNumberOrNull(movement.previousBalanceLiters) ?? 0;
  entity.newBalanceLiters = toNumberOrNull(movement.newBalanceLiters) ?? 0;
  entity.effectiveDate = movement.effectiveDate;
  entity.notes = movement.notes;
  entity.pricePerLiter = toNumberOrNull(movement.pricePerLiter);
  entity.totalAmount = toNumberOrNull(movement.totalAmount);
  entity.invoiceNumber = movement.invoiceNumber;
  entity.fuelStationId = movement.fuelStationId;
  entity.fuelSupplyId = movement.fuelSupplyId;
  entity.vehicleId = movement.vehicleId;
  entity.driverId = movement.driverId;
  entity.tripId = movement.tripId;
  entity.createdBy = movement.createdBy;
  entity.createdAt = movement.createdAt;
  return entity;
}
