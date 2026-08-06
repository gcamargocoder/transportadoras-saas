import { Customer } from '@prisma/client';
import { CustomerEntity } from '../entities/customer.entity';

export function toCustomerEntity(customer: Customer): CustomerEntity {
  const entity = new CustomerEntity();
  entity.id = customer.id;
  entity.tenantId = customer.tenantId;
  entity.name = customer.name;
  entity.document = customer.document;
  entity.isActive = customer.isActive;
  entity.createdAt = customer.createdAt;
  entity.updatedAt = customer.updatedAt;
  return entity;
}
