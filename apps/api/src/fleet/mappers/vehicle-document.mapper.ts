import { Document } from '@prisma/client';
import { VehicleDocumentEntity } from '../entities/vehicle-document.entity';
import { resolveDocumentExpiryStatus } from '../utils/document-expiry.util';

export function toVehicleDocumentEntity(document: Document): VehicleDocumentEntity {
  const entity = new VehicleDocumentEntity();
  entity.id = document.id;
  entity.vehicleId = document.ownerId;
  entity.type = document.type;
  entity.number = document.number;
  entity.issuedAt = document.issuedAt;
  entity.expiresAt = document.expiresAt;
  entity.expiryStatus = resolveDocumentExpiryStatus(document.expiresAt);
  entity.createdAt = document.createdAt;
  return entity;
}
