import { Tire, Trailer, UserAccount, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TireEntity, TireLifecycleEntity } from '../entities/tire.entity';
import { TireLifecycleResult } from '../utils/tire-lifecycle.util';

export type TireWithRelations = Tire & {
  vehicle: Vehicle | null;
  trailer: Trailer | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

// Fase 64 -- so passado por TiresService.findOne (GET /tires/:id); listagem
// (GET /tires) chama sem o 2o argumento e o campo fica null, evitando N+1.
export function toTireEntity(tire: TireWithRelations, lifecycle?: TireLifecycleResult): TireEntity {
  const entity = new TireEntity();
  entity.id = tire.id;
  entity.tenantId = tire.tenantId;
  entity.fireNumber = tire.fireNumber;
  entity.manufacturer = tire.manufacturer;
  entity.model = tire.model;
  entity.size = tire.size;
  entity.dot = tire.dot;
  entity.serialNumber = tire.serialNumber;
  entity.purchaseDate = tire.purchaseDate;
  entity.purchasePrice = toNumberOrNull(tire.purchasePrice);
  entity.expectedLifespanKm = toNumberOrNull(tire.expectedLifespanKm);
  entity.initialTreadDepthMm = toNumberOrNull(tire.initialTreadDepthMm);
  entity.currentTreadDepthMm = toNumberOrNull(tire.currentTreadDepthMm);
  entity.status = tire.status;
  entity.locationType = tire.locationType;
  entity.vehicleId = tire.vehicleId;
  entity.vehiclePlate = tire.vehicle?.plate ?? null;
  entity.trailerId = tire.trailerId;
  entity.trailerPlate = tire.trailer?.plate ?? null;
  entity.position = tire.position;
  entity.createdBy = tire.createdBy;
  entity.creatorName = tire.creator.name;
  entity.updatedBy = tire.updatedBy;
  entity.updaterName = tire.updater?.name ?? null;
  entity.createdAt = tire.createdAt;
  entity.updatedAt = tire.updatedAt;
  entity.lifecycle = lifecycle
    ? Object.assign(new TireLifecycleEntity(), {
        totalCost: lifecycle.totalCost,
        interventionsCount: lifecycle.interventionsCount,
        daysInstalled: lifecycle.daysInstalled,
        costPerKm: lifecycle.costPerKm,
      })
    : null;
  return entity;
}
