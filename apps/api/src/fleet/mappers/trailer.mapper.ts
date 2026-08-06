import { Trailer } from '@prisma/client';
import { TrailerEntity } from '../entities/trailer.entity';

export function toTrailerEntity(trailer: Trailer): TrailerEntity {
  const entity = new TrailerEntity();
  entity.id = trailer.id;
  entity.tenantId = trailer.tenantId;
  entity.plate = trailer.plate;
  entity.type = trailer.type;
  entity.notes = trailer.notes;
  entity.isActive = trailer.isActive;
  entity.createdAt = trailer.createdAt;
  entity.updatedAt = trailer.updatedAt;
  return entity;
}
