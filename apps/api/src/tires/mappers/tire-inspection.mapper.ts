import { TireInspection, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TireInspectionEntity } from '../entities/tire-inspection.entity';

export type TireInspectionWithRelations = TireInspection & { creator: UserAccount };

export function toTireInspectionEntity(
  inspection: TireInspectionWithRelations,
): TireInspectionEntity {
  const entity = new TireInspectionEntity();
  entity.id = inspection.id;
  entity.tireId = inspection.tireId;
  entity.inspectionDate = inspection.inspectionDate;
  entity.treadDepthMm = toNumberOrNull(inspection.treadDepthMm) ?? 0;
  entity.pressurePsi = toNumberOrNull(inspection.pressurePsi);
  entity.notes = inspection.notes;
  entity.createdBy = inspection.createdBy;
  entity.creatorName = inspection.creator.name;
  entity.createdAt = inspection.createdAt;
  return entity;
}
