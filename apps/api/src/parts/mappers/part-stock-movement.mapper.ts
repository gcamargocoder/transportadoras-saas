import { PartStockMovement } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PartStockMovementEntity } from '../entities/part-stock-movement.entity';

export function toPartStockMovementEntity(movement: PartStockMovement): PartStockMovementEntity {
  const entity = new PartStockMovementEntity();
  entity.id = movement.id;
  entity.partId = movement.partId;
  entity.type = movement.type;
  entity.quantity = toNumberOrNull(movement.quantity) ?? 0;
  entity.unitCost = toNumberOrNull(movement.unitCost);
  entity.movementDate = movement.movementDate;
  entity.reason = movement.reason;
  entity.reference = movement.reference;
  entity.notes = movement.notes;
  entity.maintenanceId = movement.maintenanceId;
  entity.createdBy = movement.createdBy;
  entity.createdAt = movement.createdAt;
  return entity;
}
