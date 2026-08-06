import { Location } from '@prisma/client';
import { LocationEntity } from '../entities/location.entity';

export function toLocationEntity(location: Location): LocationEntity {
  const entity = new LocationEntity();
  entity.id = location.id;
  entity.tenantId = location.tenantId;
  entity.name = location.name;
  entity.type = location.type;
  entity.address = location.address;
  entity.createdAt = location.createdAt;
  entity.updatedAt = location.updatedAt;
  return entity;
}
