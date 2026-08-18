import { Driver } from '@prisma/client';
import { DriverEntity } from '../entities/driver.entity';

export interface DriverCurrentVehicleContext {
  currentVehicleId: string | null;
  currentVehiclePlate: string | null;
}

const NO_CURRENT_VEHICLE: DriverCurrentVehicleContext = { currentVehicleId: null, currentVehiclePlate: null };

export function toDriverEntity(driver: Driver, currentVehicle: DriverCurrentVehicleContext = NO_CURRENT_VEHICLE): DriverEntity {
  const entity = new DriverEntity();
  entity.id = driver.id;
  entity.tenantId = driver.tenantId;
  entity.userAccountId = driver.userAccountId;
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
  entity.type = driver.type;
  entity.status = driver.status;
  entity.isAvailable = driver.isAvailable;
  entity.currentVehicleId = currentVehicle.currentVehicleId;
  entity.currentVehiclePlate = currentVehicle.currentVehiclePlate;
  entity.createdAt = driver.createdAt;
  entity.updatedAt = driver.updatedAt;
  return entity;
}
