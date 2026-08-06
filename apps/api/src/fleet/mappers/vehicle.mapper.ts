import { Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { VehicleEntity } from '../entities/vehicle.entity';

export function toVehicleEntity(vehicle: Vehicle): VehicleEntity {
  const entity = new VehicleEntity();
  entity.id = vehicle.id;
  entity.tenantId = vehicle.tenantId;
  entity.fleetId = vehicle.fleetId;
  entity.plate = vehicle.plate;
  entity.renavam = vehicle.renavam;
  entity.chassisNumber = vehicle.chassisNumber;
  entity.brand = vehicle.brand;
  entity.model = vehicle.model;
  entity.manufactureYear = vehicle.manufactureYear;
  entity.modelYear = vehicle.modelYear;
  entity.color = vehicle.color;
  entity.type = vehicle.type;
  entity.category = vehicle.category;
  entity.fuelType = vehicle.fuelType;
  entity.tankCapacityLiters = toNumberOrNull(vehicle.tankCapacityLiters);
  entity.averageConsumptionKmL = toNumberOrNull(vehicle.averageConsumptionKmL);
  entity.odometerKm = toNumberOrNull(vehicle.odometerKm);
  entity.grossWeightKg = toNumberOrNull(vehicle.grossWeightKg);
  entity.netWeightKg = toNumberOrNull(vehicle.netWeightKg);
  entity.cargoCapacityKg = toNumberOrNull(vehicle.cargoCapacityKg);
  entity.axleCount = vehicle.axleCount;
  entity.notes = vehicle.notes;
  entity.status = vehicle.status;
  entity.createdAt = vehicle.createdAt;
  entity.updatedAt = vehicle.updatedAt;
  return entity;
}
