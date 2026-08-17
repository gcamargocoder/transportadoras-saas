import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FreightRuleEntity } from './freight-rule.entity';

export class PaginatedFreightRulesEntity {
  @ApiProperty({ type: [FreightRuleEntity] })
  items!: FreightRuleEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
