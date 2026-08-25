import { Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { VehicleEntity } from '../entities/vehicle.entity';
import { resolveFleetAvailabilityStatus, resolveVehicleAvailability } from '../services/vehicle-availability.service';

// Fase 62 -- contexto derivado (motorista atual + em viagem agora),
// resolvido em lote pelo VehiclesService (nunca 1 query por veiculo) e
// injetado aqui, mesmo padrao de DriverCurrentVehicleContext (drivers/mappers/driver.mapper.ts).
export interface VehicleDerivedContext {
  currentDriverId: string | null;
  currentDriverName: string | null;
  onTrip: boolean;
}

const NO_DERIVED_CONTEXT: VehicleDerivedContext = {
  currentDriverId: null,
  currentDriverName: null,
  onTrip: false,
};

export function toVehicleEntity(
  vehicle: Vehicle,
  context: VehicleDerivedContext = NO_DERIVED_CONTEXT,
): VehicleEntity {
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
  entity.ownershipType = vehicle.ownershipType;
  entity.currentDriverId = context.currentDriverId;
  entity.currentDriverName = context.currentDriverName;
  entity.availability = resolveVehicleAvailability(vehicle.status, context.onTrip);
  const fleetAvailability = resolveFleetAvailabilityStatus(vehicle.status, context.onTrip);
  entity.fleetAvailabilityStatus = fleetAvailability.status;
  entity.unavailabilityReason = fleetAvailability.reason;
  entity.createdAt = vehicle.createdAt;
  entity.updatedAt = vehicle.updatedAt;
  return entity;
}
