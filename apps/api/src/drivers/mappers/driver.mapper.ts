import { Driver } from '@prisma/client';
import { DriverEntity } from '../entities/driver.entity';

export function toDriverEntity(driver: Driver): DriverEntity {
  const entity = new DriverEntity();
  entity.id = driver.id;
  entity.tenantId = driver.tenantId;
  entity.name = driver.name;
  entity.cpf = driver.cpf;
  entity.rg = driver.rg;
  entity.cnhNumber = driver.cnhNumber;
  entity.cnhCategory = driver.cnhCategory;
  entity.cnhExpiresAt = driver.cnhExpiresAt;
  entity.birthDate = driver.birthDate;
  entity.phone = driver.phone;
  entity.email = driver.email;
  entity.address = driver.address;
  entity.city = driver.city;
  entity.state = driver.state;
  entity.zipCode = driver.zipCode;
  entity.notes = driver.notes;
  entity.admissionDate = driver.admissionDate;
  entity.terminationDate = driver.terminationDate;
  entity.isActive = driver.isActive;
  entity.createdAt = driver.createdAt;
  entity.updatedAt = driver.updatedAt;
  return entity;
}
