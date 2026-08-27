import { CustomerContact } from '@prisma/client';
import { CustomerContactEntity } from '../entities/customer-contact.entity';

export function toCustomerContactEntity(contact: CustomerContact): CustomerContactEntity {
  const entity = new CustomerContactEntity();
  entity.id = contact.id;
  entity.tenantId = contact.tenantId;
  entity.customerId = contact.customerId;
  entity.name = contact.name;
  entity.role = contact.role;
  entity.phone = contact.phone;
  entity.email = contact.email;
  entity.notes = contact.notes;
  entity.isPrimary = contact.isPrimary;
  entity.createdAt = contact.createdAt;
  entity.updatedAt = contact.updatedAt;
  return entity;
}
