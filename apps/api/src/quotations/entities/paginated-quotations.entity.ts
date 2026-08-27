import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { QuotationEntity } from './quotation.entity';

export class PaginatedQuotationsEntity {
  @ApiProperty({ type: [QuotationEntity] })
  items!: QuotationEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
