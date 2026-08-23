import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FinancialPeriodEntity } from './financial-period.entity';

export class PaginatedFinancialPeriodsEntity {
  @ApiProperty({ type: [FinancialPeriodEntity] })
  items!: FinancialPeriodEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
