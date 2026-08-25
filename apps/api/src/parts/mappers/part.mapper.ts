import { Part } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PartEntity } from '../entities/part.entity';

export function toPartEntity(part: Part): PartEntity {
  const entity = new PartEntity();
  entity.id = part.id;
  entity.tenantId = part.tenantId;
  entity.sku = part.sku;
  entity.name = part.name;
  entity.description = part.description;
  entity.unit = part.unit;
  entity.category = part.category;
  entity.manufacturer = part.manufacturer;
  entity.oemCode = part.oemCode;
  entity.minStock = toNumberOrNull(part.minStock);
  entity.currentStock = toNumberOrNull(part.currentStock) ?? 0;
  entity.isLowStock = part.isLowStock;
  entity.isZeroStock = entity.currentStock <= 0;
  entity.isActive = part.isActive;
  entity.createdAt = part.createdAt;
  entity.updatedAt = part.updatedAt;
  return entity;
}
