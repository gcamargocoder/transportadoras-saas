import { FuelStation } from '@prisma/client';
import { FuelStationEntity } from '../entities/fuel-station.entity';

export function toFuelStationEntity(station: FuelStation): FuelStationEntity {
  const entity = new FuelStationEntity();
  entity.id = station.id;
  entity.tenantId = station.tenantId;
  entity.name = station.name;
  entity.cnpj = station.cnpj;
  entity.city = station.city;
  entity.state = station.state;
  entity.isActive = station.isActive;
  entity.createdAt = station.createdAt;
  entity.updatedAt = station.updatedAt;
  return entity;
}
