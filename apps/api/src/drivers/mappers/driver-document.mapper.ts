import { Document } from '@prisma/client';
import { DriverDocumentEntity } from '../entities/driver-document.entity';

export function toDriverDocumentEntity(document: Document): DriverDocumentEntity {
  const entity = new DriverDocumentEntity();
  entity.id = document.id;
  entity.driverId = document.ownerId;
  entity.type = document.type;
  entity.number = document.number;
  entity.issuedAt = document.issuedAt;
  entity.expiresAt = document.expiresAt;
  entity.createdAt = document.createdAt;
  return entity;
}
