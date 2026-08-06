import { Fleet } from '@prisma/client';
import { FleetEntity } from '../entities/fleet.entity';

export function toFleetEntity(fleet: Fleet): FleetEntity {
  const entity = new FleetEntity();
  entity.id = fleet.id;
  entity.tenantId = fleet.tenantId;
  entity.name = fleet.name;
  entity.type = fleet.type;
  entity.locationId = fleet.locationId;
  entity.isActive = fleet.isActive;
  entity.createdAt = fleet.createdAt;
  entity.updatedAt = fleet.updatedAt;
  return entity;
}
