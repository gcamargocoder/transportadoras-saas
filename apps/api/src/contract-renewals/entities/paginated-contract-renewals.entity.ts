import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ContractRenewalEntity } from './contract-renewal.entity';

export class PaginatedContractRenewalsEntity {
  @ApiProperty({ type: [ContractRenewalEntity] })
  items!: ContractRenewalEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
