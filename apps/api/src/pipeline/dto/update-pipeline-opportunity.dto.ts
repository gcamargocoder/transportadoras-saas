import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePipelineOpportunityDto } from './create-pipeline-opportunity.dto';

// PATCH /pipeline/opportunities/:id -- conteudo, nunca o estagio (ver
// PATCH /pipeline/opportunities/:id/stage, unica forma de mover -- mantem
// o registro de motivo/data de fechamento centralizado num unico lugar).
// Bloqueado quando o estagio atual e terminal (isWon/isLost) -- ver
// PipelineOpportunitiesService.assertContentEditable.
export class UpdatePipelineOpportunityDto extends PartialType(
  OmitType(CreatePipelineOpportunityDto, ['stageId'] as const),
) {}
