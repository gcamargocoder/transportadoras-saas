import { TireDisposal, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TireDisposalEntity } from '../entities/tire-disposal.entity';

export type TireDisposalWithRelations = TireDisposal & { creator: UserAccount };

export function toTireDisposalEntity(disposal: TireDisposalWithRelations): TireDisposalEntity {
  const entity = new TireDisposalEntity();
  entity.id = disposal.id;
  entity.tireId = disposal.tireId;
  entity.reason = disposal.reason;
  entity.disposalDate = disposal.disposalDate;
  entity.odometerKm = toNumberOrNull(disposal.odometerKm);
  entity.residualValue = toNumberOrNull(disposal.residualValue);
  entity.createdBy = disposal.createdBy;
  entity.creatorName = disposal.creator.name;
  entity.createdAt = disposal.createdAt;
  return entity;
}
