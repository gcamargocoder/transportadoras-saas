import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { ExpiringContractEntity } from './expiring-contract.entity';

export class PaginatedExpiringContractsEntity {
  @ApiProperty({ type: [ExpiringContractEntity] })
  items!: ExpiringContractEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
