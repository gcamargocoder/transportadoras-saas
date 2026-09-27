import { FuelTank } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FuelTankBalanceEntity } from '../entities/fuel-tank-balance.entity';
import { FuelTankEntity } from '../entities/fuel-tank.entity';
import { computeOccupancyPercent } from '../utils/fuel-tank-stock.util';

export function toFuelTankEntity(tank: FuelTank): FuelTankEntity {
  const capacityLiters = toNumberOrNull(tank.capacityLiters) ?? 0;
  const currentStockLiters = toNumberOrNull(tank.currentStockLiters) ?? 0;

  const entity = new FuelTankEntity();
  entity.id = tank.id;
  entity.tenantId = tank.tenantId;
  entity.name = tank.name;
  entity.fuelType = tank.fuelType;
  entity.capacityLiters = capacityLiters;
  entity.initialStockLiters = toNumberOrNull(tank.initialStockLiters) ?? 0;
  entity.currentStockLiters = currentStockLiters;
  entity.minStockLiters = toNumberOrNull(tank.minStockLiters);
  entity.occupancyPercent = computeOccupancyPercent(currentStockLiters, capacityLiters);
  entity.isLowStock = tank.isLowStock;
  entity.location = tank.location;
  entity.status = tank.status;
  entity.createdAt = tank.createdAt;
  entity.updatedAt = tank.updatedAt;
  return entity;
}

export function toFuelTankBalanceEntity(tank: FuelTank): FuelTankBalanceEntity {
  const capacityLiters = toNumberOrNull(tank.capacityLiters) ?? 0;
  const currentStockLiters = toNumberOrNull(tank.currentStockLiters) ?? 0;

  const entity = new FuelTankBalanceEntity();
  entity.tankId = tank.id;
  entity.currentStockLiters = currentStockLiters;
  entity.capacityLiters = capacityLiters;
  entity.occupancyPercent = computeOccupancyPercent(currentStockLiters, capacityLiters);
  entity.minStockLiters = toNumberOrNull(tank.minStockLiters);
  entity.isLowStock = tank.isLowStock;
  entity.status = tank.status;
  return entity;
}
