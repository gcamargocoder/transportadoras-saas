import { MaintenanceProvider } from '@prisma/client';
import { MaintenanceProviderEntity } from '../entities/maintenance-provider.entity';

export function toMaintenanceProviderEntity(provider: MaintenanceProvider): MaintenanceProviderEntity {
  const entity = new MaintenanceProviderEntity();
  entity.id = provider.id;
  entity.tenantId = provider.tenantId;
  entity.type = provider.type;
  entity.name = provider.name;
  entity.tradeName = provider.tradeName;
  entity.document = provider.document;
  entity.phone = provider.phone;
  entity.email = provider.email;
  entity.address = provider.address;
  entity.contactName = provider.contactName;
  entity.specialties = provider.specialties;
  entity.notes = provider.notes;
  entity.isActive = provider.isActive;
  entity.createdAt = provider.createdAt;
  entity.updatedAt = provider.updatedAt;
  return entity;
}
