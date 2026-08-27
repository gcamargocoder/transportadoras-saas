import { PipelineStage } from '@prisma/client';
import { PipelineStageEntity } from '../entities/pipeline-stage.entity';

export function toPipelineStageEntity(stage: PipelineStage): PipelineStageEntity {
  const entity = new PipelineStageEntity();
  entity.id = stage.id;
  entity.tenantId = stage.tenantId;
  entity.name = stage.name;
  entity.order = stage.order;
  entity.isWon = stage.isWon;
  entity.isLost = stage.isLost;
  entity.isActive = stage.isActive;
  entity.createdAt = stage.createdAt;
  entity.updatedAt = stage.updatedAt;
  return entity;
}
