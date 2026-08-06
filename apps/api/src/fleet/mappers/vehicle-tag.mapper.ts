import { TagProvider, VehicleTag } from '@prisma/client';
import { TagProviderEntity } from '../entities/tag-provider.entity';
import { VehicleTagEntity } from '../entities/vehicle-tag.entity';

export function toVehicleTagEntity(tag: VehicleTag): VehicleTagEntity {
  const entity = new VehicleTagEntity();
  entity.id = tag.id;
  entity.vehicleId = tag.vehicleId;
  entity.tagProviderId = tag.tagProviderId;
  entity.tagNumber = tag.tagNumber;
  entity.isActive = tag.isActive;
  entity.activatedAt = tag.activatedAt;
  entity.createdAt = tag.createdAt;
  return entity;
}

export function toTagProviderEntity(provider: TagProvider): TagProviderEntity {
  const entity = new TagProviderEntity();
  entity.id = provider.id;
  entity.name = provider.name;
  return entity;
}
