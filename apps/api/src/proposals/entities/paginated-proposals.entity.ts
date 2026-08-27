import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ProposalEntity } from './proposal.entity';

export class PaginatedProposalsEntity {
  @ApiProperty({ type: [ProposalEntity] })
  items!: ProposalEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
