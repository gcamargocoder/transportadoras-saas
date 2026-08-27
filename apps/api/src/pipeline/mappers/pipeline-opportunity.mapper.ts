import { Customer, PipelineOpportunity, PipelineStage, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PipelineOpportunityEntity } from '../entities/pipeline-opportunity.entity';

export type PipelineOpportunityWithRelations = PipelineOpportunity & {
  customer: Customer;
  proposal: { number: number } | null;
  stage: PipelineStage;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toPipelineOpportunityEntity(opportunity: PipelineOpportunityWithRelations): PipelineOpportunityEntity {
  const entity = new PipelineOpportunityEntity();
  entity.id = opportunity.id;
  entity.tenantId = opportunity.tenantId;
  entity.customerId = opportunity.customerId;
  entity.customerName = opportunity.customer.name;
  entity.quotationId = opportunity.quotationId;
  entity.proposalId = opportunity.proposalId;
  entity.proposalNumber = opportunity.proposal?.number ?? null;
  entity.stageId = opportunity.stageId;
  entity.stageName = opportunity.stage.name;
  entity.stageIsWon = opportunity.stage.isWon;
  entity.stageIsLost = opportunity.stage.isLost;
  entity.title = opportunity.title;
  entity.estimatedValue = toNumberOrNull(opportunity.estimatedValue);
  entity.notes = opportunity.notes;
  entity.lostReason = opportunity.lostReason;
  entity.wonAt = opportunity.wonAt;
  entity.lostAt = opportunity.lostAt;
  entity.createdBy = opportunity.createdBy;
  entity.creatorName = opportunity.creator.name;
  entity.updatedBy = opportunity.updatedBy;
  entity.updaterName = opportunity.updater?.name ?? null;
  entity.createdAt = opportunity.createdAt;
  entity.updatedAt = opportunity.updatedAt;
  return entity;
}
