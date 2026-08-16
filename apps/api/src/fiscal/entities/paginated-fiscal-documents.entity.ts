import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FiscalDocumentEntity } from './fiscal-document.entity';

export class PaginatedFiscalDocumentsEntity {
  @ApiProperty({ type: [FiscalDocumentEntity] })
  items!: FiscalDocumentEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
