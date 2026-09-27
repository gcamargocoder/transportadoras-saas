import { Driver, FuelTankMovement, Prisma, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FuelTankMovementEntity } from '../entities/fuel-tank-movement.entity';

// Fase 3 -- nomes amigaveis de veiculo/motorista/viagem no historico do
// tanque (INTERNAL_FUELING), mesmo padrao ja usado por FuelSupplyEntity/
// SUPPLY_INCLUDE (vehiclePlate/driverName/tripLabel).
export const MOVEMENT_INCLUDE = {
  vehicle: true,
  driver: true,
  trip: {
    select: {
      origin: { select: { name: true } },
      destination: { select: { name: true } },
    },
  },
} satisfies Prisma.FuelTankMovementInclude;

export type FuelTankMovementWithRelations = FuelTankMovement & {
  vehicle: Vehicle | null;
  driver: Driver | null;
  trip: { origin: { name: string }; destination: { name: string } } | null;
};

// Aceita tanto o resultado com relacoes (getMovements, MOVEMENT_INCLUDE)
// quanto o FuelTankMovement puro devolvido por applyMovement (create/
// registerReceipt/registerInternalFueling nunca precisam do nome amigavel,
// so do id) -- vehicle/driver/trip ficam null nesse segundo caso.
export function toFuelTankMovementEntity(
  movement: FuelTankMovement & Partial<Pick<FuelTankMovementWithRelations, 'vehicle' | 'driver' | 'trip'>>,
): FuelTankMovementEntity {
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
  entity.vehiclePlate = movement.vehicle?.plate ?? null;
  entity.driverId = movement.driverId;
  entity.driverName = movement.driver?.name ?? null;
  entity.tripId = movement.tripId;
  entity.tripLabel = movement.trip ? `${movement.trip.origin.name} → ${movement.trip.destination.name}` : null;
  entity.createdBy = movement.createdBy;
  entity.createdAt = movement.createdAt;
  return entity;
}
