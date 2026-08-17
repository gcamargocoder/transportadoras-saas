import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ContractEntity } from './contract.entity';

export class PaginatedContractsEntity {
  @ApiProperty({ type: [ContractEntity] })
  items!: ContractEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
