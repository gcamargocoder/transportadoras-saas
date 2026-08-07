import { Driver, FuelStation, FuelSupply, UserAccount, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FuelSupplyEntity } from '../entities/fuel-supply.entity';

export type FuelSupplyWithRelations = FuelSupply & {
  vehicle: Vehicle;
  driver: Driver;
  fuelStation: FuelStation;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toFuelSupplyEntity(supply: FuelSupplyWithRelations): FuelSupplyEntity {
  const entity = new FuelSupplyEntity();
  entity.id = supply.id;
  entity.tenantId = supply.tenantId;
  entity.vehicleId = supply.vehicleId;
  entity.vehiclePlate = supply.vehicle.plate;
  entity.driverId = supply.driverId;
  entity.driverName = supply.driver.name;
  entity.tripId = supply.tripId;
  entity.fuelStationId = supply.fuelStationId;
  entity.fuelStationName = supply.fuelStation.name;
  entity.attachmentId = supply.attachmentId;
  entity.fuelType = supply.fuelType;
  entity.liters = toNumberOrNull(supply.liters) ?? 0;
  entity.pricePerLiter = toNumberOrNull(supply.pricePerLiter) ?? 0;
  entity.totalAmount = toNumberOrNull(supply.totalAmount) ?? 0;
  entity.odometerKm = toNumberOrNull(supply.odometerKm) ?? 0;
  entity.supplyDate = supply.supplyDate;
  entity.paymentType = supply.paymentType;
  entity.invoiceNumber = supply.invoiceNumber;
  entity.notes = supply.notes;
  entity.createdBy = supply.createdBy;
  entity.creatorName = supply.creator.name;
  entity.updatedBy = supply.updatedBy;
  entity.updaterName = supply.updater?.name ?? null;
  entity.createdAt = supply.createdAt;
  entity.updatedAt = supply.updatedAt;
  return entity;
}
