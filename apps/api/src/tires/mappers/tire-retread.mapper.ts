import { TireRetread, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TireRetreadEntity } from '../entities/tire-retread.entity';

export type TireRetreadWithRelations = TireRetread & { creator: UserAccount };

export function toTireRetreadEntity(retread: TireRetreadWithRelations): TireRetreadEntity {
  const entity = new TireRetreadEntity();
  entity.id = retread.id;
  entity.tireId = retread.tireId;
  entity.company = retread.company;
  entity.cost = toNumberOrNull(retread.cost) ?? 0;
  entity.retreadDate = retread.retreadDate;
  entity.warranty = retread.warranty;
  entity.mileageKm = toNumberOrNull(retread.mileageKm);
  entity.notes = retread.notes;
  entity.createdBy = retread.createdBy;
  entity.creatorName = retread.creator.name;
  entity.createdAt = retread.createdAt;
  return entity;
}
