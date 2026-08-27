import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { PipelineOpportunityEntity } from './pipeline-opportunity.entity';

export class PaginatedPipelineOpportunitiesEntity {
  @ApiProperty({ type: [PipelineOpportunityEntity] })
  items!: PipelineOpportunityEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
