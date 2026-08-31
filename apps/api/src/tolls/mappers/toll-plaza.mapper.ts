import { TollPlaza } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TollPlazaEntity } from '../entities/toll-plaza.entity';

export function toTollPlazaEntity(plaza: TollPlaza): TollPlazaEntity {
  const entity = new TollPlazaEntity();
  entity.id = plaza.id;
  entity.name = plaza.name;
  entity.operator = plaza.operator;
  entity.type = plaza.type;
  entity.highway = plaza.highway;
  entity.km = toNumberOrNull(plaza.km);
  entity.city = plaza.city;
  entity.state = plaza.state;
  entity.latitude = toNumberOrNull(plaza.latitude);
  entity.longitude = toNumberOrNull(plaza.longitude);
  entity.pricePerAxle = toNumberOrNull(plaza.pricePerAxle);
  entity.createdAt = plaza.createdAt;
  entity.updatedAt = plaza.updatedAt;
  return entity;
}
