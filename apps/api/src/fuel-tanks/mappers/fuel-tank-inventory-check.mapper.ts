import { FuelTankInventoryCheck } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FuelTankInventoryCheckEntity } from '../entities/fuel-tank-inventory-check.entity';
import { computeDivergencePercent } from '../utils/fuel-tank-stock.util';

export function toFuelTankInventoryCheckEntity(check: FuelTankInventoryCheck): FuelTankInventoryCheckEntity {
  const theoreticalStockLiters = toNumberOrNull(check.theoreticalStockLiters) ?? 0;
  const divergenceLiters = toNumberOrNull(check.divergenceLiters) ?? 0;

  const entity = new FuelTankInventoryCheckEntity();
  entity.id = check.id;
  entity.tankId = check.tankId;
  entity.checkedAt = check.checkedAt;
  entity.theoreticalStockLiters = theoreticalStockLiters;
  entity.measuredStockLiters = toNumberOrNull(check.measuredStockLiters) ?? 0;
  entity.divergenceLiters = divergenceLiters;
  entity.divergencePercent = computeDivergencePercent(theoreticalStockLiters, divergenceLiters);
  entity.adjusted = check.adjusted;
  entity.adjustmentMovementId = check.adjustmentMovementId;
  entity.notes = check.notes;
  entity.createdBy = check.createdBy;
  entity.createdAt = check.createdAt;
  return entity;
}
